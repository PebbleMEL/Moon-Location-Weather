#include <pebble.h>
#include <math.h>
  
#undef APP_LOG
#define APP_LOG(...)

// #define LOG_TAPS

#define KEY_STRING1 0
#define KEY_STRING2 1
#define KEY_STRING3 2
#define KEY_TIMEZONEOFFSET 3
#define KEY_LOCATIONCORRECTION 4
#define KEY_INTERVAL 5
#define KEY_FGCOLOR 6
#define KEY_BGCOLOR 7
  
#define TRIGGER_AXIS ACCEL_AXIS_Y
  
// Length of lunar periods in seconds - from http://en.wikipedia.org/wiki/Orbit_of_the_Moon
#define SYNODIC_MONTH 2551443 // lunar orbital period wrt sun
#define ANOMOLISTIC_MONTH 2380717 // period between appogees
  
#define LUNAR_DAY 89428 // mean time between meridian crossings
#define RECENT_NEW_MOON 592500 // datetime of a recent new moon in seconds in London since 0:00 1/1/1970
#define RECENT_LUNAR_MIDNIGHT 75410 // datetime of a recent lunar midnight (time when the moon was on the far side of the earth) in London in seconds since 0:00 1/1/1970
#define RECENT_APOGEE 1414829380 //datetime of a recent time at which the moon was at its mean distance from earth and getting closer, in seconds since 0:00 1/1/70
  
#define LUNAR_DAY_VARIATION 1581 // amplitude of lunar day variations due to changing distance between earth and moon, in seconds
#define SECONDS_IN_WEEK 604800
  
static Window *s_main_window;
static TextLayer *s_time_layer;
static TextLayer *s_date_layer;
static TextLayer *s_string1_layer;
static TextLayer *s_string2_layer;
static TextLayer *s_string3_layer;
static TextLayer *s_battery_layer;
static TextLayer *s_bluetooth_layer;
static TextLayer *s_query_layer;
static TextLayer *s_ampm_layer;
static TextLayer *s_timezone_layer;
static TextLayer *s_moon_layer;
static TextLayer *s_fill1_layer, *s_fill2_layer;
static GFont s_time_font;
static GFont s_other_font;
static GFont s_status_font;
static int timezoneoffset = 0;
static char timezonebuffer[6];
static int locationcorrection = 0;
static int interval = 30;
static int minutetofire = -1; // -1 => will be set on next tick
static int fgcolor = 0;       // GColorBlack
static int bgcolor = 0x3F;    // GColorWhite
static char string1buffer[24], string2buffer[24], string3buffer[24];
static AppTimer *taptimer;

#ifdef LOG_TAPS
static u_int vibesxp = 0;
static u_int vibesxn = 0;
static u_int vibesyp = 0;
static u_int vibesyn = 0;
static u_int vibeszp = 0;
static u_int vibeszn = 0;
#endif
  
static void update_time() {
  // Get a tm structure
  time_t now = time(NULL);
  struct tm *tick_time = localtime(&now);
  struct tm *gm_time = gmtime(&now);

  // Create a long-lived buffer
  static char timebuffer[] = "00:00 ";
  static char datebuffer[] = "Mon 31 Jan   ";
  static char batterybuffer[] = "??";
  static char moonbuffer[]="????????";
  static bool first_time = true;

  // Write battery status if required
  if ((first_time) || (tick_time->tm_min % 5 == 0)) {
    BatteryChargeState battery = battery_state_service_peek();
    snprintf(batterybuffer, sizeof(batterybuffer), "%d", battery.charge_percent/10);
    text_layer_set_text(s_battery_layer, batterybuffer);
  }
    
  // Write moon phase and location data.  
  time_t gmtnow, localnow;
  if (clock_is_timezone_set()) {
    timezoneoffset = 60 * (60 * (24 * (tick_time->tm_wday - gm_time->tm_wday) + tick_time->tm_hour - gm_time->tm_hour) + tick_time->tm_min - gm_time->tm_min);
    if (timezoneoffset > SECONDS_IN_WEEK/2) timezoneoffset -= SECONDS_IN_WEEK;
    if (timezoneoffset < -SECONDS_IN_WEEK/2) timezoneoffset += SECONDS_IN_WEEK;
    if (timezoneoffset % 3600 == 0)
      snprintf(timezonebuffer, sizeof(timezonebuffer), "%i", (int)(timezoneoffset / 3600));
    else
      snprintf(timezonebuffer, sizeof(timezonebuffer), "%i.", (int)(timezoneoffset / 3600));
    text_layer_set_text(s_timezone_layer, timezonebuffer);
    gmtnow = now;
    localnow = now + timezoneoffset;
  } else /* time zone not set, so we use what comes in from the phone */ {
    gmtnow = now - timezoneoffset;
    localnow = now;
  }
  
  snprintf(moonbuffer, sizeof(moonbuffer), "%02d %02d", (int)(((gmtnow - RECENT_NEW_MOON) % SYNODIC_MONTH) / (24 * 60 * 60)),
    (int) (((localnow - RECENT_LUNAR_MIDNIGHT - (LUNAR_DAY_VARIATION * sin_lookup ((gmtnow - RECENT_APOGEE) / (ANOMOLISTIC_MONTH / TRIG_MAX_ANGLE)) / TRIG_MAX_RATIO ) + locationcorrection)
    % LUNAR_DAY) * 100 / LUNAR_DAY));
  text_layer_set_text(s_moon_layer, moonbuffer);

  // Write the current hours and minutes into the buffer
  if(clock_is_24h_style()) {
    //Use 24 hour format
    strftime(timebuffer, sizeof(timebuffer), "%H:%M", tick_time);
  } else {
    //Use 12 hour format.
    strftime(timebuffer, sizeof(timebuffer), "%l:%M", tick_time);  
  }

  // Display this time on the TextLayer
  if (timebuffer[0] == ' ') 
    text_layer_set_text(s_time_layer, timebuffer+1);
  else
    text_layer_set_text(s_time_layer, timebuffer);
 
  // Write the date and am/pm if required
  if ((first_time) || ((tick_time->tm_min == 0) && (tick_time->tm_hour % 12 == 0))) { 
    strftime(datebuffer, sizeof(datebuffer), "%a %d %b", tick_time);
    text_layer_set_text(s_date_layer, datebuffer);
    if (!clock_is_24h_style()) {
      if (tick_time->tm_hour < 12) 
        text_layer_set_text(s_ampm_layer, "A");
      else
        text_layer_set_text(s_ampm_layer, "P");
    }
  }
  first_time = false;
}

void bluetooth_connection_callback(bool connected) {
  APP_LOG(APP_LOG_LEVEL_INFO, "bluetooth connected=%d", (int) connected);
  if (connected) {
    text_layer_set_text(s_bluetooth_layer, "");
    // Get weather information.
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);
    dict_write_uint8(iter, 0, 0);
    app_message_outbox_send();
  } else {
    text_layer_set_text(s_bluetooth_layer, "!");
    vibes_short_pulse();
  }
}

// Forward declare taptimer_handler because we want to reference it in tap_handler.
static void taptimer_handler(void);

static void tap_handler(AccelAxisType axis, int32_t direction) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Got a tap: %d %d.", (int) axis, (int) direction);

#ifdef LOG_TAPS
  if (axis == ACCEL_AXIS_X) {
    if (direction>0) vibesxp++; else vibesxn++;
  }
  if (axis == ACCEL_AXIS_Y) {
    if (direction>0) vibesyp++; else vibesyn++;
  }
  if (axis == ACCEL_AXIS_Z) {
    if (direction>0) vibeszp++; else vibeszn++;
  }
  snprintf(stringbuffer, sizeof(stringbuffer), "X:%d %d\nY:%d %d\nZ:%d %d", vibesxp, vibesxn, vibesyp, vibesyn, vibeszp, vibeszn);
  text_layer_set_text(s_string_layer, stringbuffer);   
#else
  if (axis == TRIGGER_AXIS) {
    // Stop listening for more taps for 15 seconds.
    taptimer = app_timer_register(15000, (AppTimerCallback) taptimer_handler, NULL);
    accel_tap_service_unsubscribe();
 
    // But respond to this one.
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);
    // Add a key-value pair.
    dict_write_uint8(iter, 0, 0);
    // Send the message!
    app_message_outbox_send();
    text_layer_set_text(s_query_layer, "?");
    // Then flag that won't need to fire again for a full interval.
    minutetofire = -1;
  }
#endif
}

static void taptimer_handler(void) {
  accel_tap_service_subscribe(tap_handler);
}

static void set_fgcolor(void) {
// #ifdef PBL_COLOR
  GColor8 newcolor = (GColor8){ .argb = ((uint8_t) fgcolor) | 0b11000000};
// #else
//   int newcolor = fgcolor;
// #endif
  text_layer_set_text_color(s_time_layer, newcolor);
  text_layer_set_text_color(s_date_layer, newcolor);
  text_layer_set_text_color(s_string1_layer, newcolor);
  text_layer_set_text_color(s_string2_layer, newcolor);
  text_layer_set_text_color(s_string3_layer, newcolor);
  text_layer_set_text_color(s_moon_layer, newcolor);
  text_layer_set_text_color(s_battery_layer, newcolor);
  text_layer_set_text_color(s_bluetooth_layer, newcolor);
  text_layer_set_text_color(s_query_layer, newcolor);
  text_layer_set_text_color(s_ampm_layer, newcolor);
  text_layer_set_text_color(s_timezone_layer, newcolor);  
}

static void set_bgcolor(void) {
// #ifdef PBL_COLOR
  GColor8 newcolor = (GColor8){ .argb = ((uint8_t) bgcolor) | 0b11000000};
// #else
//   int newcolor = fgcolor;
// #endif
  text_layer_set_background_color(s_time_layer, newcolor);
  text_layer_set_background_color(s_date_layer, newcolor);
  text_layer_set_background_color(s_string1_layer, newcolor);
  text_layer_set_background_color(s_string2_layer, newcolor);
  text_layer_set_background_color(s_string3_layer, newcolor);
  text_layer_set_background_color(s_moon_layer, newcolor);
  text_layer_set_background_color(s_battery_layer, newcolor);
  text_layer_set_background_color(s_bluetooth_layer, newcolor);
  text_layer_set_background_color(s_query_layer, newcolor);
  text_layer_set_background_color(s_ampm_layer, newcolor);
  text_layer_set_background_color(s_fill1_layer, newcolor);
  text_layer_set_background_color(s_fill2_layer, newcolor);
  text_layer_set_background_color(s_timezone_layer, newcolor);
}

static void main_window_load(Window *window) {
 // Create GFont
  s_time_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_APHont_Bold_48));
  s_other_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_APHont_Bold_24));
  s_status_font = fonts_load_custom_font(resource_get_handle(RESOURCE_ID_APHont_Bold_16));

  // Create time TextLayer
  s_time_layer = text_layer_create(GRect(0, 40, 144, 56));
  text_layer_set_font(s_time_layer, s_time_font);  
  text_layer_set_text_alignment(s_time_layer, GTextAlignmentCenter);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_time_layer));

  // Create date TextLayer
  s_date_layer = text_layer_create(GRect(0, 20, 144, 30));
  text_layer_set_font(s_date_layer, s_other_font);  
  text_layer_set_text_alignment(s_date_layer, GTextAlignmentCenter);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_date_layer));
  
  // Create String3 TextLayer
  s_string3_layer = text_layer_create(GRect(0, 140, 144, 30));
  text_layer_set_font(s_string3_layer, s_other_font);  
  text_layer_set_text_alignment(s_string3_layer, GTextAlignmentCenter);
  text_layer_set_text(s_string3_layer, "...");
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_string3_layer));

  // Create String2 TextLayer
  s_string2_layer = text_layer_create(GRect(0, 115, 144, 30));
  text_layer_set_font(s_string2_layer, s_other_font);  
  text_layer_set_text_alignment(s_string2_layer, GTextAlignmentCenter);
  text_layer_set_text(s_string2_layer, "...");
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_string2_layer));

  // Create String1 TextLayer
  s_string1_layer = text_layer_create(GRect(0, 90, 144, 30));
  text_layer_set_font(s_string1_layer, s_other_font);  
  text_layer_set_text_alignment(s_string1_layer, GTextAlignmentCenter);
  text_layer_set_text(s_string1_layer, "...");
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_string1_layer));

  // Create moon TextLayer 
  s_moon_layer = text_layer_create(GRect(36, -4, 70, 28));
  text_layer_set_font(s_moon_layer, s_other_font);  
  text_layer_set_text_alignment(s_moon_layer, GTextAlignmentCenter);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_moon_layer));

  // Create battery TextLayer
  s_battery_layer = text_layer_create(GRect(124, 0, 18, 24));
  text_layer_set_font(s_battery_layer, s_status_font);
  text_layer_set_text_alignment(s_battery_layer, GTextAlignmentRight);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_battery_layer));
  
 // Create query TextLayer
  s_query_layer = text_layer_create(GRect(106, 0, 8, 24));
  text_layer_set_font(s_query_layer, s_status_font);
  text_layer_set_text_alignment(s_query_layer, GTextAlignmentCenter);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_query_layer));
  
 // Create ampm TextLayer
  s_ampm_layer = text_layer_create(GRect(114, 0, 10, 24));
  text_layer_set_font(s_ampm_layer, s_status_font);
  text_layer_set_text_alignment(s_ampm_layer, GTextAlignmentCenter);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_ampm_layer)); 
  
 // Create timezone TextLayer
  s_timezone_layer = text_layer_create(GRect(2, 0, 29, 24));
  text_layer_set_font(s_timezone_layer, s_status_font);
  text_layer_set_text_alignment(s_timezone_layer, GTextAlignmentLeft);
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_timezone_layer));
  
  // Create bluetooth TextLayer
  s_bluetooth_layer = text_layer_create(GRect(31, 0, 5, 24));
  text_layer_set_font(s_bluetooth_layer, s_status_font);
  text_layer_set_text_alignment(s_bluetooth_layer, GTextAlignmentCenter);
  if (bluetooth_connection_service_peek()) {
    text_layer_set_text(s_bluetooth_layer, "");
  } else {
    text_layer_set_text(s_bluetooth_layer, "!");
  }
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_bluetooth_layer));
  
  // Create fill1 TextLayer
  s_fill1_layer = text_layer_create(GRect(0, 0, 2, 24));
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_fill1_layer));
  
  // Create fill1 TextLayer
  s_fill2_layer = text_layer_create(GRect(142, 0, 2, 24));
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_fill2_layer));
  
// Make sure the time is displayed from the start
  update_time();
}

static void main_window_unload(Window *window) {
  // Destroy TextLayer
  text_layer_destroy(s_time_layer);
  text_layer_destroy(s_date_layer);
  text_layer_destroy(s_string1_layer);
  text_layer_destroy(s_string2_layer);
  text_layer_destroy(s_string3_layer);
  text_layer_destroy(s_moon_layer);
  text_layer_destroy(s_battery_layer);
  text_layer_destroy(s_bluetooth_layer);
  text_layer_destroy(s_query_layer);
  text_layer_destroy(s_ampm_layer);
  text_layer_destroy(s_timezone_layer);
  text_layer_destroy(s_fill1_layer);
  text_layer_destroy(s_fill2_layer);
  // Unload Fonts
  fonts_unload_custom_font(s_time_font);
  fonts_unload_custom_font(s_other_font);
  fonts_unload_custom_font(s_status_font);
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  update_time();
  
  // Get location / weather update every 30, 5 or 1 minutes after last retreival.
  if (minutetofire == -1) 
    minutetofire = tick_time->tm_min % interval;
  else if ((tick_time->tm_min % interval) == minutetofire) {
    // Begin dictionary
    DictionaryIterator *iter;
    app_message_outbox_begin(&iter);

    // Add a key-value pair
    dict_write_uint8(iter, 0, 0);

    // Send the message!
    app_message_outbox_send();
    text_layer_set_text(s_query_layer, "?");
  }
}
  
static void inbox_received_callback(DictionaryIterator *iterator, void *context) {

static int proposedcolor;
  
  // Read first item
  Tuple *t = dict_read_first(iterator);

  // For all items
  while(t != NULL) {
    // Which key was received?
    switch(t->key) {
    case KEY_STRING1:
      snprintf(string1buffer, sizeof(string1buffer), "%s", t->value->cstring);
      text_layer_set_text(s_string1_layer, string1buffer);   
      break;
    case KEY_STRING2:
      snprintf(string2buffer, sizeof(string2buffer), "%s", t->value->cstring);
      text_layer_set_text(s_string2_layer, string2buffer);   
      break;
    case KEY_STRING3:
      snprintf(string3buffer, sizeof(string3buffer), "%s", t->value->cstring);
      text_layer_set_text(s_string3_layer, string3buffer);   
      break;
    case KEY_TIMEZONEOFFSET:
      if (!clock_is_timezone_set()) {
        timezoneoffset = t->value->int32;
        if (timezoneoffset % 3600 == 0)
          snprintf(timezonebuffer, sizeof(timezonebuffer), "%i", (int)(timezoneoffset / 3600));
        else
          snprintf(timezonebuffer, sizeof(timezonebuffer), "%i.", (int)(timezoneoffset / 3600));
        text_layer_set_text(s_timezone_layer, timezonebuffer);
      }
      break;
    case KEY_LOCATIONCORRECTION:
      locationcorrection = t->value->int32;
      break;
    case KEY_INTERVAL:
      if (interval != t->value->int32) {
        minutetofire = -1;
        interval = t->value->int32;
      }
      APP_LOG(APP_LOG_LEVEL_INFO, "requested interval = %d", interval);
      break;
    case KEY_FGCOLOR:
      #ifdef PBL_COLOR 
        proposedcolor = t->value->int32;
      #else
        if ((t->value->int32 & 0x2A) == 0) proposedcolor = 0; else proposedcolor = 0x3F;
      #endif
      APP_LOG(APP_LOG_LEVEL_INFO, "requested fgcolor = %d, proposed = %d, currentfg = %d, currentbg = %d", (int) t->value->int32, proposedcolor, fgcolor, bgcolor);
      if (fgcolor != proposedcolor) {
        fgcolor = proposedcolor;
        set_fgcolor();
      }
      break;
    case KEY_BGCOLOR:
      #ifdef PBL_COLOR
        proposedcolor = t->value->int32;
      #else
        if ((t->value->int32 & 0x2A) == 0) proposedcolor = 0; else proposedcolor = 0x3F;
      #endif
      if (proposedcolor == fgcolor) proposedcolor = 0x3F & ~proposedcolor;  // Invert the background color if it would be the same as the foreground.
      APP_LOG(APP_LOG_LEVEL_INFO, "suggested bgcolor = %d, proposed = %d, currentfg = %d, currentbg = %d", (int) t->value->int32, proposedcolor, fgcolor, bgcolor);
      if (bgcolor != proposedcolor) {
        bgcolor = proposedcolor;
        set_bgcolor();
      }
      break;
    default:
      APP_LOG(APP_LOG_LEVEL_ERROR, "Key %d not recognized!", (int)t->key);
      break;    
    }
    
  // Look for next item
  t = dict_read_next(iterator);
  }
  text_layer_set_text(s_query_layer, "");
}

static void inbox_dropped_callback(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Message dropped!");
}

static void outbox_failed_callback(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox send failed!");
}

static void outbox_sent_callback(DictionaryIterator *iterator, void *context) {
  APP_LOG(APP_LOG_LEVEL_INFO, "Outbox send success!");
}

static void init() {
  // Create main Window element and assign to pointer
  s_main_window = window_create();

  // Set handlers to manage the elements inside the Window
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = main_window_load,
    .unload = main_window_unload
  });

  // Show the Window on the watch, with animated=true
  window_stack_push(s_main_window, true);
  
  // Register with TickTimerService
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
  
  // Register callbacks for getting weather
  app_message_register_inbox_received(inbox_received_callback);
  app_message_register_inbox_dropped(inbox_dropped_callback);
  app_message_register_outbox_failed(outbox_failed_callback);
  app_message_register_outbox_sent(outbox_sent_callback);
  
  // Open AppMessage
//   app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());
  app_message_open(512, 64);

  //Register callback for bluetooth status change and tap events
  bluetooth_connection_service_subscribe(bluetooth_connection_callback);
  accel_tap_service_subscribe(tap_handler);
}

static void deinit() {
  // Destroy Window
  tick_timer_service_unsubscribe();
  bluetooth_connection_service_unsubscribe();
  accel_tap_service_unsubscribe();
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
