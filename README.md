# bing-maps-service

## how it works

### import modul.
```
var mapsService = require('bing-maps-service');
```

### init config
Get Bing API Maps Key from https://www.bingmapsportal.com/

BingAPIConfig(**Bing-API-Key**);_
OpenHabConfig(**OpenHab-Rest-URL**); **Optional**_
CronConfig(**TimeZone**); https://www.npmjs.com/package/cron

```
mapsService.init(new mapsService.AppConfig(new mapsService.BingAPIConfig('XXXXXX'),
	 new mapsService.OpenHabConfig('http://localhost:8080/rest/'),
	 new mapsService.CronConfig('Europe/Amsterdam')));
```
	 
### add all your waypoints to the list
WayPoint(ID, Coordinate, description);
```
mapsService.addWayPoint(new mapsService.WayPoint(1, '53.5xxxxx,10.0xxxxx', 'home'));
mapsService.addWayPoint(new mapsService.WayPoint(2, '53.6xxxxx,10.0xxxxx', 'some'));
mapsService.addWayPoint(new mapsService.WayPoint(3, '53.5xxxxx,9.9xxxxx', 'work'));
```

### add all your routes to the list
Route(ID, description, startWayPoint, endWaypoint, viaWaypointList, openHabTextItemName);_
viaWaypointList and openHabTextItemName are optional. When the state will be changeg, the new tate will be post to openhab to the openHabTextItemName

```
mapsService.addRoute(new mapsService.Route(1, 'Zuhause > Arbeit', 1, 3, [2], 'trafficHomeToWork'));
```

### create a cronjob. See https://www.npmjs.com/package/cron for notation.
CronJob(ID, cronNotation, description, routeList);
```
mapsService.createCronJob(new mapsService.CronJob(1, '00 30 07 * * 1-5', 'At morning', [1]));
```

### delete a cronjob by the cronJobID
```
mapsService.removeCronJob(1);
```

### Start the local Web-Service on port 3002
```
mapsService.startService(3002);
```

## Web-Service http://localhost:3002/...

### only get route status
maps/route/:routeid/status/

### only get last change time of route
maps/route/:routeid/lastStateUpdateDateTime/

### Get whole JSON Route
maps/route/:routeid/

### get running cronjob description list
maps/running/cronjobs/

### get update for route now. without cronjob
maps/route/:routeid/state/update/
