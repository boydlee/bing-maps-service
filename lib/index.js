var express = require('express');
var rp = require('request-promise');
var app = express();
var CronJob = require('cron').CronJob;

var exports = module.exports;

var runningCronjobList = [];
var appConfig;

var wayPointList = [];
var routeList = [];
var cronJobList = [];

const COMMA = ',';
const COMMA_URL_FORMATTED = '%2c';

const OPENHAB_ITEM_URL_PART ='items/';

const ROUTE_API_URL ='https://dev.virtualearth.net/REST/v1/';
const ATTRIBUTE_ID = 'ID';
const ATTRIBUTE_ROUTE_API_ROUTES = 'Routes';
const ATTRIBUTE_ROUTE_API_Key = 'key';
const ATTRIBUTE_ROUTE_API_Key_PARAM = ATTRIBUTE_ROUTE_API_Key + '=';
const ATTRIBUTE_ROUTE_API_WAY_POINT_PARAM = 'wayPoint.'+ ATTRIBUTE_ID + '=';
const ATTRIBUTE_ROUTE_API_VIA_WAY_POINT_PARAM = 'viaWaypoint.' + ATTRIBUTE_ID + '=';

function BingAPIConfig(apiKey) {
	if(!apiKey) {
		throw new Error('Bing API-Key is empty.');
	}
	
	this.apiKey = apiKey;
}

function OpenHabConfig(url) {
	if(!url) {
		throw new Error('OpenHab URL is empty.');
	}
	
	this.url = url;
}

function CronConfig(timeZone) {
	if(!timeZone) {
		throw new Error('TimeZone is empty. Check https://www.npmjs.com/package/cron for notation.');
	}
	
	this.timeZone = timeZone; // (siehe: https://www.npmjs.com/package/cron)	
}

function AppConfig(bingAPIConfig, openHabConfig, cronConfig) {
	this.bingAPIConfig = bingAPIConfig;
	this.openHabConfig = openHabConfig;
	this.cronConfig = cronConfig;
}

function WayPoint (id, coordinate, description) {
	if(!id || !coordinate || !description) {
		throw new Error('Fehler beim WayPoint Konstruktor. WayPoint konnte nicht erstellt werden. => invalid parameters.');
	}
	
    this.id = id;
    this.coordinate = coordinate;
    this.description = description;
}

function Route (id, description, startPointID, finishPointID, wayPoints, openhabItemName) {
	if(!id || !description || !startPointID || !finishPointID) {
		throw new Error('Fehler beim Route Konstruktor. Route konnte nicht erstellt werden. => invalid parameters.');
	}
	
    this.id = id;
    this.state = '-';
    this.description = description;
	this.startPointID = startPointID;
	this.finishPointID = finishPointID;
	this.wayPoints = wayPoints;
	this.openhabItemName = openhabItemName; // Name of the Openhab String Item.
	this.lastStateUpdateDateTime;
}

function CronJobDefinition (id, cronTime, description, routeList) {
	// cronTime (siehe: https://www.npmjs.com/package/cron)
	if(!id || !cronTime || !description || !routeList || (routeList.length == 0) ) {
		throw new Error('Fehler beim CronJobDefinition Konstruktor. CronJobDefinition konnte nicht erstellt werden. => invalid parameters.');
	}
	
	this.id = id;
    this.description = description;
	this.cronTime = cronTime;
	this.routeList = routeList;
	this.job;
}

function addWayPointToList(wayPoint) {
	wayPointList.forEach(function(wp, index) {
		if(wp.id == wayPoint.id) {
			throw new Error('WayPointID bereits vergeben.');
		}
	});
	
	wayPointList[wayPointList.length] = wayPoint;
}

function addRouteToList(route) {
	routeList.forEach(function(r, index) {
		if(r.id == route.id) {
			throw new Error('RouteID bereits vergeben.');
		}
	});
	console.log('Füge RouteID[' + route.id + '] zur Liste hinzu.');
	routeList[routeList.length] = route;
}

function getWayPointFromList(wayPointID) {
	
	// Hole mir einen Wegpunkt aus der Liste
	var i = 0;
	var wayPoint = undefined;
	while ( (i < wayPointList.length) && !wayPoint) {
	  if(wayPointList[i].id == wayPointID) {
		  wayPoint = wayPointList[i];
	  }
	  i++;
	}
	
	return wayPoint;
}

function getRouteFromList(routeID) {
	
	// Hole mir eine Route aus der Liste
	var i = 0;
	var route = undefined;
	
	while ( (i < routeList.length) && !route) {  
	  if(routeList[i].id == routeID) {
		  route = routeList[i];
	  }
	  i++;
	}
	
	return route;
}

function getUrlFormattedCoordinate(coordinate) {
	return coordinate.replace(COMMA, COMMA_URL_FORMATTED);
}

function getFormattedWayPointParamName(currentWayPointID){
	return ATTRIBUTE_ROUTE_API_WAY_POINT_PARAM.replace(ATTRIBUTE_ID, currentWayPointID);
}

function setNewStateForRouteID(routeID, state) {
	
	var i = 0;
	var optFoundRoute = false;
	
	while ( (i < routeList.length) && !optFoundRoute) {  
	  if(routeList[i].id == routeID) {
		  optFoundRoute = true;
		  routeList[i].state = state;
		  routeList[i].lastStateUpdateDateTime = new Date();
		  console.log('routeID[' + routeID + '] status neu gesetzt auf [' +  routeList[i].state + ']');
	  }
	  i++;
	}
}

function generateLinkForRouteID(routeID) {
	if(!routeID || routeID <= 0 ) {
	  console.error('keine gültige routeID angegeben.');
	  return;
	}
	
	var route = getRouteFromList(routeID);
	
	if(route == undefined) {
		console.error('keine Route mit der angegeben routeID gefunden.');
		return;
	} else {
		console.log('Erstelle request für Route[' + route.description + ']');
	}
	
	if(!route.startPointID) {
		console.error('Route enthält keinen Startpunkt.');
		return;
	}
	
	if(!route.finishPointID) {
		console.error('Route enthält keinen Endpunkt.');
		return;
	}
	
	var currentWayPointID = 1;
	var routeLink = ROUTE_API_URL + ATTRIBUTE_ROUTE_API_ROUTES;

	// Start Koordinate
	routeLink = routeLink + '?' + getFormattedWayPointParamName(currentWayPointID) + getUrlFormattedCoordinate(getWayPointFromList(route.startPointID).coordinate);
	
	// Zwischenpunkte
	if(route.wayPoints) {
		var sWayPoints = '';
		for (var i = 0; i < route.wayPoints.length; i++) {
			currentWayPointID++;
			var wayPoint = getWayPointFromList(route.wayPoints[i]);
			sWayPoints = sWayPoints + '&' + ATTRIBUTE_ROUTE_API_VIA_WAY_POINT_PARAM.replace('ID', currentWayPointID) + getUrlFormattedCoordinate(wayPoint.coordinate);			
		}	
		routeLink = routeLink +	sWayPoints;
	}
	
	// Ziel Koordinate
	currentWayPointID++;
	routeLink = routeLink + '&' + getFormattedWayPointParamName(currentWayPointID) + getUrlFormattedCoordinate(getWayPointFromList(route.finishPointID).coordinate);

	// den API Key hinzufügen
	routeLink = routeLink + '&' + ATTRIBUTE_ROUTE_API_Key_PARAM + appConfig.bingAPIConfig.apiKey;
	
	console.log('Erzeugter API Link[' + routeLink + ']');
	return routeLink;
}

function getStateFromRouteAsText(route) {
	return route.description + ': ' + route.state;
}

function handleRouteApiRequest(req, res) {
	var route = getRouteFromList(req.params.routeid);

	if(!route) {
		res.status(404).send('Sorry, Route nicht gefunden.');
	} else {
		return route;
	}
}	

function getTrafficForRoute(route) {
	// Rufe bestimmte Route von der API ab.
	rp(generateLinkForRouteID(route.id))
		.then(function (result) {
			var resultAsObj = JSON.parse(result);
			var travelDurationTraffic = resultAsObj.resourceSets[0].resources[0].travelDurationTraffic;
			var routeOverDesc;
			
			for (var i = 0; i < resultAsObj.resourceSets[0].resources[0].routeLegs.length; i++) {
				var routeLegDesc = resultAsObj.resourceSets[0].resources[0].routeLegs[i].description;
				routeOverDesc = (!routeOverDesc ? routeLegDesc: routeOverDesc + ', ' + routeLegDesc);
			}
			
			var routeStateText = (Math.round(travelDurationTraffic / 60 )) + ' min. Über(' + routeOverDesc + ')';
			
			setNewStateForRouteID(route.id, routeStateText); // Setzen den State, um ihn ggf. später abzurufen.
			console.log('RouteID[' + route.id + '] description[' +  route.description + '] State[' + routeStateText + '] abgerufen.');
			
			// Übertragen zu OPENHAB
			if(route.openhabItemName) {
				if(!appConfig || !appConfig.openHabConfig) {
					throw new Error('Config ist nicht richtig initialisiert. openHabConfig fehlt.');
				}
				
				console.log('Für RouteID[' + route.id + '] description[' +  route.description + '] ist ein OpenHab Item gesetzt. Poste den State zu Openhab');
				var postOptions = createOpenHabPostOptions(route.openhabItemName, (getStateFromRouteAsText(route)) );
				
				getPostNewTrafficStateToOpenHabPromise(postOptions).then(function (body) {
					if(!body) {
						console.log('Post successfull');
					} else {
						console.log(body);
					}
				})
				.catch(function (err) {
					console.error(err);
				});
			}				
		})
		.catch(function (err) {
			console.error('API Call Error für RouteID[' + route.id + '] description[' +  route.description + ']. Error[' + err + ']');
		}
	);
}

function getPostNewTrafficStateToOpenHabPromise(options) {
	console.log('Post-Options: ' + JSON.stringify(options));
	return rp(options);
}

function createOpenHabPostOptions(openhabItemName, body) {
	return options = {
		method: 'POST',
		uri: appConfig.openHabConfig.url + OPENHAB_ITEM_URL_PART + openhabItemName,
		body: body,
		headers: {
			'content-type': 'text/plain'
		}
	};	
}

function createCustomCronJob(customCronJob) {
	if(!appConfig || !appConfig.bingAPIConfig || !appConfig.cronConfig) {
		throw new Error('Config ist nicht richtig initialisiert.');
	}
		
	console.log('Erstelle Cronjob[' + customCronJob.description + '] cronTime[' + customCronJob.cronTime + ']');
	var job = new CronJob(customCronJob.cronTime, function() {
		console.log('Cronjob[' + customCronJob.description + '] wird jetzt ausgeführt.');
	  		
		// Rufe Routen von der API ab, die dem Cronjob zugewiesen sind
		if(customCronJob.routeList) {
			console.log('[' + customCronJob.routeList.length + '] Routen für Cronjobs[' + customCronJob.description + '] gefunden. Starte abruf der Routen.');
			customCronJob.routeList.forEach(function(routeID, index) {
				var route = getRouteFromList(routeID);
				getTrafficForRoute(route);
			});
		} else {
			console.log('Cronjob sind keine Routen zugewiesen, die abgerufen werden können.');
		}
		
	}, null, true, appConfig.cronConfig.timeZone);
	
	// Ausgeführer Job zum Custom CronJob hinzufügen
	customCronJob.job = job;
	// Packe CronJob zur aktuell ausgeführen CronJob Liste hinzu.
	runningCronjobList.push(customCronJob);	
}

function removeCustomCronJob(customCronJobID) {
	console.log('Lösche CronjobID[' + customCronJobID + '].');
	
	var cronJob = undefined;
	var i = 0;
	while ( (i < runningCronjobList.length) && !cronJob) {
	  if(runningCronjobList[i].id == customCronJobID) {
		  cronJob = runningCronjobList[i];
		  runningCronjobList.splice(i, 1);
	  }
	  i++;
	}
	
	if(cronJob) {
		cronJob.job.stop();
		console.log('CronjobID[' + customCronJobID + '] gelöscht.');
	} else {
		console.error('CronjobID[' + customCronJobID + '] nicht gefunden.');
	}
}

function init(config) {
	appConfig = config;
}

/** ******************************************************************************************************************************************
	REST SERVICE, um Daten der Routen abzurufen
	******************************************************************************************************************************************
**/

app.get('/maps/route/:routeid/state/', function(req, res) {
	var route = handleRouteApiRequest(req, res);

	if(route) {
		res.send(getStateFromRouteAsText(route));
	}
});

app.get('/maps/route/:routeid/lastStateUpdateDateTime/', function(req, res) {
	var route = handleRouteApiRequest(req, res);

	if(route) {
		console.log(route.lastStateUpdateDateTime.getTime());
		res.send(route.lastStateUpdateDateTime);
	}
});

app.get('/maps/route/:routeid/', function(req, res) {
	var route = handleRouteApiRequest(req, res);

	if(route) {
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(route));
	}
});

app.get('/maps/route/:routeid/state/update/', function(req, res) {
	var route = handleRouteApiRequest(req, res);
	getTrafficForRoute(route);
	
	if(route) {
		res.status(200).send('OK');
	}
});

app.get('/maps/running/cronjobs', function(req, res) {
	var currentJobs;
	runningCronjobList.forEach(function(cronJob, index) {
		currentJobs = (!currentJobs) ? cronJob.description : currentJobs + ', ' + cronJob.description;
	});
	
	res.send(currentJobs);
});

function startRestAPI(port) {
	app.listen(port);
	console.log('Maps REST Server running at port:' + port);
}

exports.addWayPoint=addWayPointToList;
exports.addRoute=addRouteToList;
exports.createCronJob=createCustomCronJob;
exports.removeCronJob=removeCustomCronJob;

exports.CronJob=CronJobDefinition;
exports.Route=Route;
exports.WayPoint=WayPoint;
exports.startService=startRestAPI;

exports.BingAPIConfig=BingAPIConfig
exports.CronConfig=CronConfig
exports.OpenHabConfig=OpenHabConfig
exports.AppConfig=AppConfig
exports.init=init;
