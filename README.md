# bing-maps-service

## init config
Get Bing API Maps Key from https://www.bingmapsportal.com/

BingAPIConfig(Bing-API-Key);
OpenHabConfig(OpenHab-Rest-URL); !OPTIONAL!
CronConfig(TimeZone); see https://www.npmjs.com/package/cron

```
init(new AppConfig(new BingAPIConfig('XXXXXX'),
	 new OpenHabConfig('http://localhost:8080/rest/'),
	 new CronConfig('Europe/Amsterdam')));
```
	 
## add all your waypoints to the list
WayPoint(ID, Coordinate, description);
```
addWayPoint(new WayPoint(1, '53.5xxxxx,10.0xxxxx', 'home'));
addWayPoint(new WayPoint(2, '53.6xxxxx,10.0xxxxx', 'some'));
addWayPoint(new WayPoint(3, '53.5xxxxx,9.9xxxxx', 'work'));
```

## add all your routes to the list
Route(ID, description, startWayPoint, endWaypoint, viaWaypointList, openHabTextItemName);
viaWaypointList and openHabTextItemName are optional. When the state will be changeg, the new tate will be post to openhab to the openHabTextItemName

```
addRoute(new Route(1, 'Zuhause > Arbeit', 1, 3, [2], 'trafficHomeToWork'));
```

## create a cronjob. See https://www.npmjs.com/package/cron for notation.
CronJob(ID, cronNotation, description, routeList);
```
createCronJob(new CronJob(1, '00 30 07 * * 1-5', 'At morning', [1]));
```

## delete a cronjob by the cronJobID
```
removeCronJob(1);
```

## Start the local Web-Service on port 3002
```
startService(3002);
```

### only get route status
/maps/route/:routeid/status/

### only get last change time of route
/maps/route/:routeid/lastStateUpdateDateTime/

### Get whole JSON Route
/maps/route/:routeid/

### get running cronjob description list
/maps/running/cronjobs/



