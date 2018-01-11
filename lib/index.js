/*
Copyright (c) 2018, Roy Ackermann. All rights reserved.
Code licensed under the BSD 2-Clause License:
http://www.opensource.org/licenses/BSD-2-Clause
version: 0.0.8
*/

var express = require('express');
var rp = require('request-promise');
var app = express();
var CronJob = require('cron').CronJob;
var exports = module.exports;
var appConfig;

var runningCronjobList = [];
var wayPointList = [];
var routeList = [];

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
	
	this.timeZone = timeZone; // (see: https://www.npmjs.com/package/cron)	
}

function AppConfig(bingAPIConfig, openHabConfig, cronConfig) {
	this.bingAPIConfig = bingAPIConfig;
	this.openHabConfig = openHabConfig;
	this.cronConfig = cronConfig;
}

function WayPoint (id, coordinate, description) {
	if(!id || !coordinate || !description) {
		throw new Error('An error occurred while creating the waypoint => invalid parameters.');
	}
	
    this.id = id;
    this.coordinate = coordinate;
    this.description = description;
}

function Route (id, description, startPointID, finishPointID, wayPoints, openhabItemName) {
	if(!id || !description || !startPointID || !finishPointID) {
		throw new Error('An error occurred while creating the route => invalid parameters.');
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

function CustomCronJob (id, cronTime, description, routeList) {
	// cronTime (see: https://www.npmjs.com/package/cron)
	if(!id || !cronTime || !description || !routeList || (routeList.length == 0) ) {
		throw new Error('An error occurred while creating the cronjob => invalid parameters.');
	}
	
	this.id = id;
    this.description = description;
	this.cronTime = cronTime;
	this.routeList = routeList;
	this.job;
}

function addWayPoint(wayPoint) {
	wayPointList.forEach(function(wp, index) {
		if(wp.id == wayPoint.id) {
			throw new Error('WayPointID[' + wayPoint.id + '] already exists.');
		}
	});
	
	wayPointList[wayPointList.length] = wayPoint;
}

function addRoute(route) {
	routeList.forEach(function(r, index) {
		if(r.id == route.id) {
			throw new Error('RouteID[' + route.id + '] already exists.');
		}
	});
	
	routeList[routeList.length] = route;
	console.log('RouteID[' + route.id + '] has been successfully added to the list.');
}

function getWayPoint(wayPointID) {
	
	// Get waypoint by id from the list
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
	
	// Get route by id from the list
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
		  console.log('The traffic-state for the RouteID[' + routeID + '] has been successfully changed to [' +  routeList[i].state + '].');
	  }
	  i++;
	}
}

function generateLinkForRouteID(routeID) {
	if(!routeID || routeID <= 0 ) {
	  console.error('Invalid routeID has been found.');
	  return;
	}
	
	var route = getRouteFromList(routeID);
	
	if(route == undefined) {
		console.error('No route has been found for the given routeID[' + routeID + ']');
		return;
	}
	if(!route.startPointID) {
		console.error('Route dont contain a starting point.');
		return;
	}
	
	if(!route.finishPointID) {
		console.error('Route dont contain a finishing point.');
		return;
	}
	
	console.log('Create request for the Route[' + route.description + ']');
	
	var currentWayPointID = 1;
	var routeLink = ROUTE_API_URL + ATTRIBUTE_ROUTE_API_ROUTES;

	// starting point
	routeLink = routeLink + '?' + getFormattedWayPointParamName(currentWayPointID) + getUrlFormattedCoordinate(getWayPoint(route.startPointID).coordinate);
	
	// waypoints
	if(route.wayPoints) {
		var sWayPoints = '';
		for (var i = 0; i < route.wayPoints.length; i++) {
			currentWayPointID++;
			var wayPoint = getWayPoint(route.wayPoints[i]);
			sWayPoints = sWayPoints + '&' + ATTRIBUTE_ROUTE_API_VIA_WAY_POINT_PARAM.replace('ID', currentWayPointID) + getUrlFormattedCoordinate(wayPoint.coordinate);			
		}	
		routeLink = routeLink +	sWayPoints;
	}
	
	// finishing point
	currentWayPointID++;
	routeLink = routeLink + '&' + getFormattedWayPointParamName(currentWayPointID) + getUrlFormattedCoordinate(getWayPoint(route.finishPointID).coordinate);

	// add the api key to the url
	routeLink = routeLink + '&' + ATTRIBUTE_ROUTE_API_Key_PARAM + appConfig.bingAPIConfig.apiKey;
	
	console.log('For the request, API-URL[' + routeLink + '] has been build .');
	return routeLink;
}

function getStateFromRouteAsText(route) {
	return route.description + ': ' + route.state;
}

function handleRouteApiRequest(req, res) {
	var route = getRouteFromList(req.params.routeid);

	if(!route) {
		var routeID = (req && req.params && req.params.routeid) ? req.params.routeid : undefined;
		res.status(404).send('No route has been found for the routeID[' + routeID + ']');
	} else {
		return route;
	}
}	

function getTrafficForRoute(route) {
	// call the api for one route
	rp(generateLinkForRouteID(route.id))
		.then(function (result) {
			var resultAsObj = JSON.parse(result);
			var travelDurationTraffic = resultAsObj.resourceSets[0].resources[0].travelDurationTraffic;
			var routeOverDesc;
			
			for (var i = 0; i < resultAsObj.resourceSets[0].resources[0].routeLegs.length; i++) {
				var routeLegDesc = resultAsObj.resourceSets[0].resources[0].routeLegs[i].description;
				routeOverDesc = (!routeOverDesc ? routeLegDesc: routeOverDesc + ', ' + routeLegDesc);
			}
			
			var hours = Math.floor(travelDurationTraffic / 3600);
			var minutes = Math.floor((travelDurationTraffic - (hours * 3600)) / 60);
			var routeStateText = hours + ':' + minutes + 'hrs. Via(' + routeOverDesc + ')';
			
			setNewStateForRouteID(route.id, routeStateText); // update the state of the route
			console.log('The state[' + routeStateText + '] has been retrieved for the routeID[' + route.id + '] with the description[' +  route.description + ']');
			
			// Update OPENHAB-Item
			if(route.openhabItemName) {
				if(!appConfig || !appConfig.openHabConfig) {
					throw new Error('The new state for the routeID[' + route.id + '] cannot be updated in your openhab installation, because the openhab-config is empty or invalid.');
				}
				
				console.log('Updating the the item[' + route.openhabItemName + '] in your openhab installation with the new state for the routeID[' + route.id + '].');
				var postOptions = createOpenHabPostOptions(route.openhabItemName, (getStateFromRouteAsText(route)) );
				
				getPostNewTrafficStateToOpenHabPromise(postOptions).then(function (body) {
					if(!body) {
						console.log('The item[' + route.openhabItemName + '] has been successfully updated in your openhab[' + appConfig.openHabConfig.url + '] installation.');
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
			console.error('An error occurred during the Bing-API-Call for the RouteID[' + route.id + '] description[' +  route.description + ']. Error-Message[' + err + ']');
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

function addCustomCronJob(customCronJob) {
	if(!appConfig || !appConfig.bingAPIConfig || !appConfig.cronConfig) {
		throw new Error('Config is invalid. Please run the init function.');
	}
		
	console.log('Create cronjob[' + customCronJob.description + '] with cronTime[' + customCronJob.cronTime + ']');
	var job = new CronJob(customCronJob.cronTime, function() {
		console.log('Cronjob[' + customCronJob.description + '] is currently being execute.');
	  		
		// Start calling the api for each route of the cronjob
		if(customCronJob.routeList) {
			console.log('[' + customCronJob.routeList.length + '] routes has been found for the cronjob[' + customCronJob.description + ']. Start calling the api for each route.');
			customCronJob.routeList.forEach(function(routeID, index) {
				var route = getRouteFromList(routeID);
				getTrafficForRoute(route);
			});
		} else {
			console.log('Not routes are assigned to the cronjob[' + customCronJob.description + '].');
		}
		
	}, null, true, appConfig.cronConfig.timeZone);
	
	// add the task to the custom cronjob object.
	customCronJob.job = job;
	// add the cronjob to the list
	runningCronjobList.push(customCronJob);	
}

function removeCustomCronJob(customCronJobID) {
	console.log('Remove cronjobID[' + customCronJobID + '].');
	
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
		console.log('CronjobID[' + customCronJobID + '] has been successfully stoped and removed from the list.');
	} else {
		console.error('CronjobID[' + customCronJobID + '] not found.');
	}
}

function init(config) {
	appConfig = config;
}

/** ******************************************************************************************************************************************
	WEB-SERVICE
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

exports.addWayPoint=addWayPoint;
exports.addRoute=addRoute;
exports.createCronJob=addCustomCronJob;
exports.removeCronJob=removeCustomCronJob;

exports.CronJob=CustomCronJob;
exports.Route=Route;
exports.WayPoint=WayPoint;
exports.startService=startRestAPI;

exports.BingAPIConfig=BingAPIConfig
exports.CronConfig=CronConfig
exports.OpenHabConfig=OpenHabConfig
exports.AppConfig=AppConfig
exports.init=init;
