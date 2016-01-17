// Disable console for production or comment this line out to enable it for debugging.
console.log = function() {};

var setPebbleToken = 'FAMZ';
var choice1 = parseInt(localStorage.getItem("choice1") || "0");
var choice2 = parseInt(localStorage.getItem("choice2") || "0");
var tempunits = localStorage.getItem("tempunits") || "C";
var windunits = localStorage.getItem("windunits") || "k";
var reference = localStorage.getItem("reference") || "";
var refLat = parseFloat(localStorage.getItem("refLat"));
var refLong = parseFloat(localStorage.getItem("refLong"));
var interval = parseInt(localStorage.getItem("interval") || "30");
var fgcolor = parseInt(localStorage.getItem("fgcolor") || "0");
var bgcolor = parseInt(localStorage.getItem("bgcolor") || "63");
var lastWeather = JSON.parse(localStorage.getItem("lastWeather"));
var lastWeatherTime = parseInt(localStorage.getItem("lastWeatherTime") || "0");
var apikey = localStorage.getItem("apikey") || "";
var noWeatherYet = true;
var timeZoneOffset = 0;
var locationCorrection = 0;
var divider = 1000000;
var R = 6371000; // metres
var yardLength = 0.9144;
var footLength = yardLength/3;
var yardsInMile = 1760;
var yardsInNauticalMile = 2025.372;
var myAccuracy, myLat, myLong, myAltitude, myAltitudeAccuracy, mySpeed, myHeading, locationWatcher, locationTimer, firstOfRun, sentToWatch, transactionID;
var samplingTimeOver = true; 
var options = { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
var degreesymbol = "\u00B0";
var plusorminussymbol = "\u00B1";
var currentTime, pin;
var canWriteTimelinePins = true;  // until we find otherwise.
  
var xhrRequest = function (url, type, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    callback(this.responseText);
  };
  xhr.open(type, url);
  xhr.send();
};

function locationSuccess(pos) {
  console.log("lat=" + pos.coords.latitude, "long=" + pos.coords.longitude, "accuracy=" + pos.coords.accuracy + " at " + pos.timestamp);
  console.log("over=" + samplingTimeOver, "sent=" + sentToWatch, "first=" + firstOfRun, "watcher=" + locationWatcher);
  if (!firstOfRun) {   // First reads bring back old data so we avoid using them. //
    if (pos.coords.accuracy <= myAccuracy) {
      myAccuracy = pos.coords.accuracy;
      myLat = pos.coords.latitude;
      myLong = pos.coords.longitude;
      myAltitude = pos.coords.altitude;
      myAltitudeAccuracy = pos.coords.altitudeAccuracy;
      mySpeed = pos.coords.speed;
      myHeading = pos.coords.heading;
      if ((myAccuracy < 6) || ((choice1 > 1) && (myAccuracy < 200))) samplingTimeOver = true;
      if (samplingTimeOver) sendToWatch();
    } 
  }
  firstOfRun = false;
}

function processWeather(json) {
  // Processes a good weather response, send the result back to the watch and update the timeline pin (but don't send it, as processResponse will do this if required).
  var string1, string2, string3;
  console.log("JSON = " + JSON.stringify(json));
  if (typeof json.current_observation != 'undefined') /* Weather Underground */ {

    var temp = Math.round((tempunits == "F") ? json.current_observation.temp_f : json.current_observation.temp_c) + tempunits;
    string1 = temp + " " + json.current_observation.weather.substr(json.current_observation.weather.lastIndexOf(" ") + 1);
      
    // Wind speed in m/s converted to km/h, mph or knots
    var wind = json.current_observation.wind_kph / 3.6;
    var gust = json.current_observation.wind_gust_kph / 3.6;
    var dirn = json.current_observation.wind_degrees;
    var multiplier = (windunits == "k" ? 3.6 : (windunits == "M" ? 2.237 : (windunits == "K" ? 1.944 : 1)));
    gust = gust > wind + 1 ? gust : 0;
    wind *= multiplier;
    gust *= multiplier;
    wind = Math.round(wind) + (gust > 0 ? '-' + Math.round(gust) : '');

    if (wind == "0") wind = "no wind"; else {
      wind += windunits;
      if (wind.length < 5) wind += (windunits == "m" ? "/s" : (windunits == "K" ? "n" : "ph"));
        wind += ' ' + (dirn < 22 ? "N" : (dirn < 67 ? "NE" : (dirn < 112 ? "E" : (dirn < 157 ? "SE":  
          (dirn < 202 ? "S" : (dirn < 247 ? "SW" : (dirn < 292 ? "W" : (dirn < 337 ? "NW" : "N"))))))));
    }
      
    // Air pressure
    var pressure  = (typeof json.current_observation.pressure_mb == 'undefined' ? "?" :
      (tempunits == "F" ? (json.current_observation.pressure_in + "inHg") : 
      (json.current_observation.pressure_mb + "hPa")));
    if (json.current_observation.pressure_trend != "0") pressure += json.current_observation.pressure_trend;  //or maybe 21e1 or 21e3
      
    string2 = (choice1 == 3) ? wind : pressure;
  
    var humidity = (typeof json.current_observation.relative_humidity == 'undefined') ? "?" : json.current_observation.relative_humidity;
 
    var rain = (tempunits == "F") ? 
      (typeof json.current_observation.precip_1hr_in == 'undefined' ? "none" : 
      (Number(json.current_observation.precip_1hr_in) > 0 ? (Number(json.current_observation.precip_1hr_in).toFixed(2) + "in/h") :"none")) :
      (typeof json.current_observation.precip_1hr_metric == 'undefined' ? "none" : 
      (Number(json.current_observation.precip_1hr_metric) > 0 ? (Number(json.current_observation.precip_1hr_metric).toFixed(1) + "mm/h") : "none"));
    
    var raintoday = (tempunits == "F") ? 
      (typeof json.current_observation.precip_today_in == 'undefined' ? "none" : 
      (Number(json.current_observation.precip_today_in) > 0 ? (Number(json.current_observation.precip_today_in).toFixed(2) + "in") :"none")) :
      (typeof json.current_observation.precip_today_metric == 'undefined' ? "none" : 
      (Number(json.current_observation.precip_today_metric) > 0 ? (Number(json.current_observation.precip_today_metric).toFixed(1) + "mm") : "none"));
    
    var feelslike = Math.round(tempunits == "F" ? json.current_observation.feelslike_f : json.current_observation.feelslike_c) + tempunits;
    
    var city = json.current_observation.observation_location.city;
    if (city.indexOf(",") > 0) city = city.substring(0,city.indexOf(","));

    string3 = (rain == "none") ? humidity : rain;
      
    if (canWriteTimelinePins) {
      var date = new Date(1000*Number(json.current_observation.observation_epoch));
      console.log("Date/time = " + date);
      
      // Create a pin.
      pin = {
        "id": "latest_weather",
        "time": date.toISOString(),
        "layout": {
          "type": "genericPin",
          "title": json.current_observation.weather,
          "tinyIcon": "system://images/PARTLY_CLOUDY",
          "body": "Temp: " + temp + "\nWind: " + wind + "\nPress: " + pressure + "\nRain: " + rain + "\n  (" + raintoday + " today)" +
            "\nHumidity: " + humidity + "\nFeels like " + feelslike +"\nin " + city + "\nfrom Weather Underground."
        },
      };
      console.log('Created pin: ' + JSON.stringify(pin));
 
    }
  } else if (typeof json.main != "undefined") /* Openweathermap.org */ {
    // Temperature in Kelvin requires adjustment + add descripion
    var temp = (tempunits == "F") ? Math.round(((json.main.temp - 273.15) * 1.8) + 32) + tempunits + " " + json.weather[0].main :
      Math.round(json.main.temp - 273.15) + tempunits + " ";
    string1 = temp + json.weather[0].main;
      
    // Wind speed in m/s converted to km/h, mph or knots
    var wind = json.wind.speed;
    var gust = json.wind.gust;
    var dirn = json.wind.deg;
    var multiplier = (windunits == "k" ? 3.6 : (windunits == "M" ? 2.237 : (windunits == "K" ? 1.944 : 1)));
    gust = gust > wind + 1 ? gust : 0;
    wind *= multiplier;
    gust *= multiplier;
    wind = String(Math.round(wind)) + (gust > 0 ? '-' + String(Math.round(gust)) : '');
    if (wind == "0") wind = "no wind"; else {
      wind += windunits;
      if (wind.length < 5) wind += (windunits == "m" ? "/s" : (windunits == "K" ? "n" : "ph"));
      wind += ' ' + (dirn < 22 ? "N" : (dirn < 67 ? "NE" : (dirn < 112 ? "E" : (dirn < 157 ? "SE":  
        (dirn < 202 ? "S" : (dirn < 247 ? "SW" : (dirn < 292 ? "W" : (dirn < 337 ? "NW" : "N"))))))));
    }
      
    // Air pressure
    var pressure  = (typeof json.main.pressure == 'undefined' ? "?" : (tempunits == "F" ? 
      ((json.main.pressure/33.864).toFixed(2) +"inHg") : (json.main.pressure.toFixed(0) +"hPa")));
      
    string2 = (choice1 == 3) ? wind : pressure;
  
    var humidity = (typeof json.main.humidity == 'undefined' ? "?" : (String(Math.round(json.main.humidity)) + "%"));
 
    var rain = (tempunits == "F") ? 
      (typeof json.rain == 'undefined' ? "none" : (json.rain['1h'] > 0 ? (String((json.rain['1h'] / 25.4).toFixed(2)) + "in/h") :
      (json.rain['3h'] > 0 ? String((json.rain['3h'] / 25.4).toFixed(2)) + "in/3h" : "none"))) :
      (typeof json.rain == 'undefined' ? "none" : (json.rain['1h'] > 0 ? (String(json.rain['1h'].toFixed(1)) + "mm/h") : 
      (json.rain['3h'] > 0 ? String(json.rain['3h'].toFixed(1)) + "mm/3h" : "none")));

    var snow = (tempunits == "F") ? 
      (typeof json.snow == 'undefined' ? "none" : (json.snow['1h'] > 0 ? ((json.snow['1h'] / 25.4).toFixed(1) + "in/h") :
      (json.snow['3h'] > 0 ? String((json.snow['3h'] / 25.4).toFixed(1)) + "in/3h" : "none"))) :
      (typeof json.snow == 'undefined' ? "none" : (json.snow['1h'] > 0 ? (json.snow['1h'].toFixed(0) + "mm/h") : 
      (json.snow['3h'] > 0 ? String(json.snow['3h'].toFixed(0)) + "mm/3h" : "none")));

    string3 = (rain == "none") ? ((snow == "none") ? humidity : snow) : rain;
      
    var cloud = json.clouds.all;
  
    if (canWriteTimelinePins) {
      var date = new Date(1000*json.dt);
      console.log("Date/time = " + date);
      
      // Create a pin.
      pin = {
        "id": "latest_weather",
        "time": date.toISOString(),
        "layout": {
          "type": "genericPin",
          "title": json.weather[0].description,
          "tinyIcon": "system://images/PARTLY_CLOUDY",
          "body": "Temp: " + temp + "\nWind: " + wind + "\nPress: " + pressure + "\nRain: " + rain + "\nSnow: " + snow + 
            "\nHumidity: " + humidity + "\nCloud: " + cloud + "%\nin " + json.name + "\nfrom Open Weather Map."
        },
      };
    console.log('Created pin: ' + JSON.stringify(pin));
    }
  }
  
  console.log("String1 = " + string1 + ".");
  console.log("String2 = " + string2 + ".");
  console.log("String3 = " + string3 + ".");
      
  if (choice1 > 2) /* displaying weather on watch */ {
    // Assemble dictionary using our keys
    var dictionary = {
      "KEY_TIMEZONEOFFSET" : timeZoneOffset,
      "KEY_LOCATIONCORRECTION" : locationCorrection,
      "KEY_STRING1": string1,
      "KEY_STRING2": string2,
      "KEY_STRING3": string3,
      "KEY_INTERVAL": interval,
      "KEY_FGCOLOR": fgcolor,
      "KEY_BGCOLOR": bgcolor
    };

    // Send to Pebble
    
    transactionID = Pebble.sendAppMessage( dictionary,
      function(e) { console.log('Weather info sent to Pebble successfully! ' + e.data.transactionId); },
      function(e) { console.log('Error sending weather info to Pebble! ' + e.data.transactionId + ' Error is: ' + e.data.error.message); } );
  }
}

function processResponse(responseText) {
  // responseText may be able to be parsed into a JSON object with weather info, but not neccessarily.
  console.log("Response text is " + responseText + ".");
  try {
    var json = JSON.parse(responseText);
    noWeatherYet = false;
    processWeather(json);
    lastWeather = json;
    lastWeatherTime = currentTime;
    localStorage.setItem("lastWeather", responseText);
    localStorage.setItem("lastWeatherTime", lastWeatherTime.getTime());
    if (canWriteTimelinePins) 
      try /* to insert the pin in the timeline */ {
        insertUserPin(pin, function(responseText) { console.log('Result: ' + responseText); });
      } 
      catch(err) /* if it failed, we won't try again */
        { canWriteTimelinePins = false; }
  } catch (err) {
    if ((currentTime < lastWeatherTime + 3610000) && lastWeather) /* we have valid weather from the last hour */ 
      processWeather(lastWeather);
    console.log("Invalid weather: " + err);
  }
}      

function sendAddress(responseText) {
  // responseText may be able to be parsed into a JSON object with address info, but not neccessarily.
  console.log("Response text is " + responseText + ".");
  var string1 = JSON.parse(responseText).results[0].address_components[0].short_name;
  var string2 = JSON.parse(responseText).results[0].address_components[1].short_name;
  var string3 = JSON.parse(responseText).results[0].address_components[2].short_name;
  if ((string1.length + string2.length) < 10) {
    string1 += " " + string2;
    string2 = string3;
    string3 = JSON.parse(responseText).results[0].address_components[3].short_name;
  }
  if ((string2.length + string3.length) < 10) {
    string2 += " " + string3;
    string3 = JSON.parse(responseText).results[0].address_components[4].short_name;
  }
  string1 = string1.replace(/North/g,"N");
  string1 = string1.replace(/East/g,"E");
  string1 = string1.replace(/South/g,"S");
  string1 = string1.replace(/West/g,"W");
  string2 = string2.replace(/North/g,"N");
  string2 = string2.replace(/East/g,"E");
  string2 = string2.replace(/South/g,"S");
  string2 = string2.replace(/West/g,"W");
  string3 = string3.replace(/North/g,"N");
  string3 = string3.replace(/East/g,"E");
  string3 = string3.replace(/South/g,"S");
  string3 = string3.replace(/West/g,"W");
  console.log ("String 1 = " + string1);
  console.log ("String 2 = " + string2);
  console.log ("String 3 = " + string3);
  var dictionary = {
    "KEY_TIMEZONEOFFSET" : timeZoneOffset,
    "KEY_LOCATIONCORRECTION" : locationCorrection,
    "KEY_STRING1": string1,
    "KEY_STRING2": string2,
    "KEY_STRING3": string3,
    "KEY_INTERVAL": interval,
    "KEY_FGCOLOR": fgcolor,
    "KEY_BGCOLOR": bgcolor
  };

  // Send to Pebble
  transactionID = Pebble.sendAppMessage( dictionary,
    function(e) { console.log('Weather info sent to Pebble successfully! ' + e.data.transactionId); },
    function(e) { console.log('Error sending weather info to Pebble! ' + e.data.transactionId + ' Error is: ' + e.data.error.message); } );
}

function sendToWatch() {

  navigator.geolocation.clearWatch(locationWatcher);
  clearTimeout(locationTimer);
  if (sentToWatch) return;
  sentToWatch = true;

  var string1, string2, string3;

  console.log("Choice 1 = " + choice1 + ", Choice 2 = " + choice2);
  
  currentTime = new Date();
  timeZoneOffset = Math.round(-60 * currentTime.getTimezoneOffset());
  locationCorrection = Math.round(89428 * myLong / 360 - timeZoneOffset);
  console.log("timeZoneOffset = " + timeZoneOffset, "locationCorrection = " + locationCorrection);
  console.log("currentTime = " + currentTime);
  console.log("lastWeatherTime = " + lastWeatherTime);
  console.log("diff = " + (currentTime-lastWeatherTime));
  console.log("lastWeather = " + JSON.stringify(lastWeather));

  // If we're displaying weather and have weather info < 15 minutes old, then we don't need to get a location or retrieve weather so we just process the cached weather result.
  if ((choice1 > 2) && ((currentTime - lastWeatherTime) < 890000) && lastWeather) {
    console.log("Processing lastWeather.");
    processWeather(lastWeather);
    return;
  }
  
  if ((choice1 <= 2) || noWeatherYet) /* we're going to send location information */ {
    if (choice1 == 2) /* sending address */ {
      console.log("Getting address...");
      xhrRequest("https://maps.googleapis.com/maps/api/geocode/json?latlng=" + myLat.toFixed(5) + "," + myLong.toFixed(5), 'GET', sendAddress);
    } else if (choice1 == 1) /* sending distance and bearing to home, speed, heading and altitude */ {
      console.log("Reference = " + refLat, refLong);
      if (isNaN(refLat) || isNaN(refLong)) /* no reference coords, so make the current location the reference */ {
        refLong = myLong;
        refLat = myLat;
        localStorage.setItem("refLat", refLat);
        localStorage.setItem("refLong", refLong);
      }
      if ((Math.round(myLat*divider) == Math.round(refLat*divider)) && (Math.round(myLong*divider) == Math.round(refLong*divider)))
        string1 = "At reference";
      else {
        var dLat = (myLat - refLat) * Math.PI / 180;
        console.log("Latitude difference (radians): " + dLat);
        var dLong = (myLong - refLong) * Math.PI / 180;
        console.log("Longitude difference (radians): " + dLong);
        var l1 = refLat * Math.PI / 180;
        var l2 = myLat * Math.PI / 180;
        console.log("current and stored latitudes in radians: " + l1 + ',' + l2);
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLong/2) * Math.sin(dLong/2) * Math.cos(l1) * Math.cos(l2); 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        var distance = Math.round(R * c);
        var y = Math.sin(dLong) * Math.cos(l2);
        var x = Math.cos(l1)*Math.sin(l2) - Math.sin(l1)*Math.cos(l2)*Math.cos(dLong);
        var bearing = (180 + (Math.atan2(y, x) / Math.PI * 180)).toFixed(0) + degreesymbol;
        console.log("Calculated distance = " + distance, "bearing = " + bearing);
        if (windunits=="M") {
          distance = distance / yardLength;
          if (distance < yardsInMile/2) {
            distance = distance.toFixed(0);
            string1 = distance + "yd " + bearing;
          } else {
            distance = distance / yardsInMile;
            distance = distance.toFixed(distance < 10 ? 2 : (distance < 100 ? 1 : 0));
            string1 = distance + "M " + bearing;
          } 
        } else if (windunits=="K") {
          distance = distance / yardLength;
          if (distance < yardsInNauticalMile/2) {
            distance = distance.toFixed(0);
            string1 = distance + "yd " + bearing;
          } else {
            distance = distance / yardsInNauticalMile;
            distance = distance.toFixed(distance < 10 ? 2 : (distance < 100 ? 1 : 0));
            string1 = distance + "N " + bearing;
          }
        } else /* using metres and kilometres */ {
          if (distance < 1000) {
            distance = distance.toFixed(0);
            string1 = distance + "m " + bearing;
        } else {
            distance = distance / 1000;
            distance = distance.toFixed(distance < 10 ? 2 : (distance < 100 ? 1 : 0));
            string1 = distance + "k " + bearing;
          }
        } 
      }  
      if (mySpeed > 0.5) {
        string2 = (mySpeed * (windunits == "k" ? 3.6 : (windunits == "M" ? 2.237 : (windunits == "K" ? 1.944 : 1)))).toFixed(0) + windunits;
        if (string2.length<4) string2 += (windunits == "m" ? "/s" : (windunits == "K" ? "n" : "ph"));
        if (!((myHeading === null) || isNaN(myHeading))) {
          if (myHeading < 0) myHeading += 360;
          string2 += " " + myHeading.toFixed(0) + degreesymbol;
        }
      } else /* no speed, so show accuracy instead */
        string2 = plusorminussymbol + (((windunits == "M") || (windunits == "K")) ? 
          ((myAccuracy/yardLength).toFixed(0) + "yd") : (myAccuracy.toFixed(0) +"m"));
      if (myAltitude === null) {
        if (string2[0] == plusorminussymbol) 
          string3 = ""; /* blank string3 if string2 was used to show accuracy */
        else
          string3 = plusorminussymbol + (((windunits == "M") || (windunits == "K")) ? 
            ((myAccuracy/yardLength).toFixed(0) + "yd") : (myAccuracy.toFixed(0) +"m"));
      } else /* if altitude valid */ {
        string3 = ((windunits == "M") || (windunits == "K")) ? (myAltitude / footLength).toFixed(0) : myAltitude.toFixed(0);
        if (myAltitudeAccuracy === null)
          string3 += ((windunits == "M") || (windunits == "K")) ? "ft" : "m";
        else /* if altitude accuracy valid */
          string3 += plusorminussymbol + (((windunits == "M") || (windunits == "K")) ?
            ((myAltitudeAccuracy / footLength).toFixed(0) + "ft") : (myAltitudeAccuracy.toFixed(0) + "m"));
      }
    } else /* choice = 0, sending latitude, longitude and altitude, plus possibly weather afterwards */ {
      var digits = myAccuracy < 10 ? 5 : (myAccuracy < 100 ? 4 : (myAccuracy < 1000 ? 3 : (myAccuracy < 10000 ? 2 : 1)));
      string1 = (myLat>=0 ? myLat.toFixed(digits)+"N" : (-myLat).toFixed(digits)+"S");
      string2 = (myLong>=0 ? myLong.toFixed(digits)+"E" : (-myLong).toFixed(digits)+"W");
      if (myAltitude === null) 
        string3 = plusorminussymbol + (((windunits == "M") || (windunits == "K")) ? 
          ((myAccuracy/yardLength).toFixed(0) + "yd") : (myAccuracy.toFixed(0) +"m"));
      else /* if altitude valid */ {
        if (myAltitudeAccuracy === null)
          string3 = ((windunits == "M") || (windunits == "K")) ? ((myAltitude/footLength).toFixed(0) + "ft") :
            (myAltitude.toFixed(0) + "m");
        else /* if altitude accuracy valid */
          string3 = ((windunits == "M") || (windunits == "K")) ? 
            ((myAltitude/footLength).toFixed(0) + plusorminussymbol + (myAltitudeAccuracy/footLength).toFixed(0) + "ft") :
            (myAltitude.toFixed(0) + plusorminussymbol + myAltitudeAccuracy.toFixed(0) + "m");
      }
    }
    
    console.log("String 1 = " + string1 + ", String 2 = " + string2 + ", String 3 = " + string3);
    
    var dictionary = {
      "KEY_TIMEZONEOFFSET" : timeZoneOffset,
      "KEY_LOCATIONCORRECTION" : locationCorrection,
      "KEY_STRING1": string1,
      "KEY_STRING2": string2,
      "KEY_STRING3": string3,
      "KEY_INTERVAL": interval,
      "KEY_FGCOLOR": fgcolor,
      "KEY_BGCOLOR": bgcolor
    };

    transactionID = Pebble.sendAppMessage( dictionary,
      function(e) { console.log('Location info sent to Pebble successfully! ' + e.data.transactionId); },
      function(e) { console.log('Error sending location info to Pebble! ' + e.data.transactionId + ' Error is: ' + e.data.error.message); } );
  }
  
  console.log(choice2, canWriteTimelinePins, (currentTime - lastWeatherTime), lastWeather);
  
  if ((choice1 > 2) || (canWriteTimelinePins && (((currentTime - lastWeatherTime) >= 890000) || !lastWeather))) {
    // Construct URL to get the weather.
    var url = (apikey.length == 16) ?
      "http://api.wunderground.com/api/" + apikey + "/conditions/q/" + myLat.toFixed(4) + "," + myLong.toFixed(4) + ".json" :
      "http://api.openweathermap.org/data/2.5/weather?lat=" + myLat.toFixed(4) + "&lon=" + myLong.toFixed(4) + "&APPID=962939929e8759394bc932270f735c74";
    console.log ("url = " + url);

    // Send request to OpenWeatherMap
    xhrRequest(url, 'GET', processResponse);
  }
}

function locationError(err) {
  console.log("Error requesting location! - " + err.code);
  navigator.geolocation.clearWatch(locationWatcher);
  clearTimeout(locationTimer);
  if (noWeatherYet) {
    var dictionary = {
      "KEY_STRING1": "Location",
      "KEY_STRING2": "Error",
      "KEY_STRING3": err.message,
      "KEY_INTERVAL": interval,
      "KEY_FGCOLOR": fgcolor,
      "KEY_BGCOLOR": bgcolor
    };
    transactionID = Pebble.sendAppMessage( dictionary,
      function(e) { console.log('Location info sent to Pebble successfully! ' + e.data.transactionId); },
      function(e) { console.log('Error sending location info to Pebble! ' + e.data.transactionId + ' Error is: ' + e.data.error.message); } );
  }
}

function getWeather() {
  if (!samplingTimeOver) sendToWatch();
  myAccuracy = 999999;
  sentToWatch = false;
  if (choice2 === 0) {
    samplingTimeOver = true;
    firstOfRun = false;
    navigator.geolocation.getCurrentPosition(locationSuccess, locationError, options);
  } else {  
    samplingTimeOver = false;
    firstOfRun = true;
    locationWatcher = navigator.geolocation.watchPosition(locationSuccess, locationError, options );
    locationTimer = setTimeout(function stopSampling() {samplingTimeOver = true; if (myAccuracy<999999) sendToWatch();}, 5000*choice2 );
  }
}

// Listen for when the watchface is opened
Pebble.addEventListener('ready', 
  function(e) {
    console.log("PebbleKit JS ready!");
    // Get the initial weather
    getWeather();
  }
);

// Listen for when an AppMessage is received
Pebble.addEventListener('appmessage',
  function(e) {
    console.log("AppMessage received!");
    getWeather();
  }                     
);

Pebble.addEventListener('showConfiguration', function(e) {
  console.log("showConfiguration received: " + 'http://x.SetPebble.com/' + setPebbleToken + '/' + Pebble.getAccountToken());
  Pebble.openURL('http://x.SetPebble.com/' + setPebbleToken + '/' + Pebble.getAccountToken());
});

Pebble.addEventListener('webviewclosed', function(e) {
  var options = JSON.parse(decodeURIComponent(e.response));
  console.log("WebviewClosed returned: " + JSON.stringify(options));
  choice1 = options["1"];
  console.log("Choice 1 set to: " + choice1);
  localStorage.setItem("choice1", choice1);
  choice2 = options["2"];
  console.log("Choice 2 set to: " + choice2);
  localStorage.setItem("choice2", choice2);
  tempunits = options["3"];
  console.log("Temp units set to: " + tempunits);
  localStorage.setItem("tempunits", tempunits);
  windunits = options["4"];
  console.log("Wind units set to: " + windunits);
  localStorage.setItem("windunits", windunits);
  if (options["5"] != reference) {
    reference = options["5"];
    localStorage.setItem("reference", reference);
    console.log("Reference set to: " + reference);
    var colonIndex = reference.indexOf(":");
    if (colonIndex > 0) reference = reference.slice(colonIndex+1,reference.length);
    reference = reference.trim();
    if (reference.length > 0) {
      var spaceIndex = reference.indexOf(" ");
      if (spaceIndex > 0) {
        refLat = parseFloat(reference.slice(0,spaceIndex));
        refLong = parseFloat(reference.slice(spaceIndex+1,reference.length));
      }
      if (isNaN(refLat) || isNaN(refLong) || (spaceIndex <= 0)) /* can't find two numerics, so we assume it's an address */ {
        var URL = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(reference);
        console.log("Calling " + URL);
        var xhr = new XMLHttpRequest();
        xhr.open("GET", URL , false);
        xhr.send();
        console.log(xhr.responseText);
        refLat = JSON.parse(xhr.responseText).results[0].geometry.location.lat;
        refLong = JSON.parse(xhr.responseText).results[0].geometry.location.lng;
      } else /* we have a latitude and longitude */ {
        var refArray = (reference.slice(0,spaceIndex)).split(",",3);
        var minutes = parseFloat(refArray[1]);
        var seconds = parseFloat(refArray[2]);
        if (minutes > 0) refLat += (refArray[0][0] == "-" ? -1 : 1) * minutes / 60;
        if (seconds > 0) refLat += (refArray[0][0] == "-" ? -1 : 1) * seconds / 3600;
        if (reference[spaceIndex-1] == 'S') refLat = -refLat;
        refArray = (reference.slice(spaceIndex+1,reference.length)).split(",",3);
        minutes = parseFloat(refArray[1]); 
        seconds = parseFloat(refArray[2]); 
        if (minutes > 0) refLong += (refArray[0][0] == "-" ? -1 : 1) * minutes / 60;
        if (seconds > 0) refLong += (refArray[0][0] == "-" ? -1 : 1) * seconds /3600;
        if (reference[reference.length-1] == 'W') refLong = -refLong;
      }
    } else /* new reference string was empty with label removed, so we invalidate the coordinates */ {
      refLong = parseFloat(null);
      refLat = parseFloat(null);
    }
    console.log("Reference location  = " + refLat, refLong);
    localStorage.setItem("refLat", refLat);
    localStorage.setItem("refLong", refLong);
  }
  interval = parseInt(options["6"]);
  console.log("Interval set to: " + interval);
  localStorage.setItem("interval", interval);
  fgcolor = options["7"];
  console.log("FGColor set to: " + fgcolor);
  localStorage.setItem("fgcolor", fgcolor);
  bgcolor = options["8"];
  console.log("BGColor set to: " + bgcolor);
  localStorage.setItem("bgcolor", bgcolor);
  apikey = options["9"];
  console.log("apikey set to: " + apikey);
  localStorage.setItem("apikey", apikey);
  noWeatherYet = true;
  getWeather();
});

/******************************* timeline lib *********************************/

// The timeline public URL root
var API_URL_ROOT = 'https://timeline-api.getpebble.com/';

/**
 * Send a request to the Pebble public web timeline API.
 * @param pin The JSON pin to insert. Must contain 'id' field.
 * @param type The type of request, either PUT or DELETE.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function timelineRequest(pin, type, callback) {
  // User or shared?
  var url = API_URL_ROOT + 'v1/user/pins/' + pin.id;

  // Create XHR
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    console.log('timeline: response received: ' + this.responseText);
    callback(this.responseText);
  };
  xhr.open(type, url);

  // Get token
  Pebble.getTimelineToken(function(token) {
    // Add headers
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', '' + token);

    // Send
    xhr.send(JSON.stringify(pin));
    console.log('timeline: request sent.');
  }, function(error) { console.log('timeline: error getting timeline token: ' + error); });
}

/**
 * Insert a pin into the timeline for this user.
 * @param pin The JSON pin to insert.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function insertUserPin(pin, callback) {
  timelineRequest(pin, 'PUT', callback);
}

/**
 * Delete a pin from the timeline for this user.
 * @param pin The JSON pin to delete.
 * @param callback The callback to receive the responseText after the request has completed.
 */
function deleteUserPin(pin, callback) {
  timelineRequest(pin, 'DELETE', callback);
}

/***************************** end timeline lib *******************************/
