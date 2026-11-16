#include <cmath>
#include <cstdio>
#include <errno.h>
#include <fcntl.h>
#include <limits>
#include <linux/input.h>
#include <linux/uinput.h>
#include <node_api.h>
#include <string.h>
#include <string>
#include <sys/file.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <vector>

static napi_value fail(napi_env env, const char *op) {
  std::string message = std::string(op) + ": " + strerror(errno);
  napi_throw_error(env, nullptr, message.c_str());
  return nullptr;
}
static napi_value number(napi_env e, int value) {
  napi_value n;
  napi_create_int32(e, value, &n);
  return n;
}
static napi_value string(napi_env e, const char *text) {
  napi_value n;
  napi_create_string_utf8(e, text, NAPI_AUTO_LENGTH, &n);
  return n;
}
static void prop(napi_env e, napi_value o, const char *k, napi_value v) {
  napi_set_named_property(e, o, k, v);
}
static int integer(napi_env e, napi_value n) {
  double v = 0;
  if (napi_get_value_double(e, n, &v) != napi_ok || !std::isfinite(v) ||
      std::floor(v) != v || v < -1 || v > 2147483647) {
    napi_throw_type_error(e, nullptr, "Native integer argument out of range");
    return std::numeric_limits<int>::min();
  }
  return static_cast<int>(v);
}
static napi_value args(napi_env e, napi_callback_info info, napi_value *a,
                       size_t count) {
  size_t c = count;
  napi_get_cb_info(e, info, &c, a, nullptr, nullptr);
  if (c < count) {
    napi_throw_type_error(e, nullptr, "Missing native arguments");
    return nullptr;
  }
  return a[0];
}
static bool bit(const unsigned char *b, int i) {
  return b[i / 8] & (1 << (i % 8));
}
static napi_value codes(napi_env e, int fd, int type, int maximum) {
  unsigned char bits[1024] = {};
  if (ioctl(fd, EVIOCGBIT(type, (maximum + 8) / 8), bits) < 0) {
    std::string operation = "EVIOCGBIT event type " + std::to_string(type);
    return fail(e, operation.c_str());
  }
  napi_value list;
  napi_create_array(e, &list);
  int n = 0;
  for (int i = 0; i <= maximum; i++)
    if (bit(bits, i))
      napi_set_element(e, list, n++, number(e, i));
  return list;
}
static napi_value capabilities(napi_env e, napi_callback_info info) {
  napi_value a[1];
  if (!args(e, info, a, 1))
    return nullptr;
  int fd = integer(e, a[0]);
  if (fd == std::numeric_limits<int>::min())
    return nullptr;
  input_id id{};
  char name[256] = {};
  if (ioctl(fd, EVIOCGID, &id) < 0)
    return fail(e, "EVIOCGID");
  if (ioctl(fd, EVIOCGNAME(sizeof(name)), name) < 0)
    return fail(e, "EVIOCGNAME");
  napi_value out, events;
  napi_create_object(e, &out);
  napi_create_object(e, &events);
  unsigned char types[32] = {};
  if (ioctl(fd, EVIOCGBIT(0, sizeof(types)), types) < 0)
    return fail(e, "EVIOCGBIT types");
  for (int type = 1; type <= EV_MAX; type++) {
    if (!bit(types, type))
      continue;
    int maximum = type == EV_KEY   ? KEY_MAX
                  : type == EV_REL ? REL_MAX
                  : type == EV_MSC ? MSC_MAX
                  : type == EV_ABS ? ABS_MAX
                  : type == EV_LED ? LED_MAX
                  : type == EV_SW  ? SW_MAX
                  : type == EV_SND ? SND_MAX
                  : type == EV_FF  ? FF_MAX
                                   : -1;
    napi_value list;
    // EV_REP (and other marker event types) has no EVIOCGBIT bitmap.
    // Its presence is reported by EVIOCGBIT(0); querying it again is EINVAL.
    if (maximum < 0)
      napi_create_array(e, &list);
    else
      list = codes(e, fd, type, maximum);
    if (!list)
      return nullptr;
    prop(e, events, std::to_string(type).c_str(), list);
  }
  napi_value absolute;
  napi_create_object(e, &absolute);
  if (bit(types, EV_ABS)) {
    unsigned char axes[(ABS_MAX + 8) / 8] = {};
    if (ioctl(fd, EVIOCGBIT(EV_ABS, sizeof(axes)), axes) < 0)
      return fail(e, "EVIOCGBIT absolute axes");
    for (int axis = 0; axis <= ABS_MAX; ++axis) {
      if (!bit(axes, axis)) continue;
      input_absinfo data{};
      if (ioctl(fd, EVIOCGABS(axis), &data) < 0) return fail(e, "EVIOCGABS");
      napi_value values; napi_create_array(e, &values);
      int fields[] = {data.value, data.minimum, data.maximum, data.fuzz, data.flat, data.resolution};
      for (int n = 0; n < 6; ++n) napi_set_element(e, values, n, number(e, fields[n]));
      prop(e, absolute, std::to_string(axis).c_str(), values);
    }
  }
  prop(e, out, "absolute", absolute);
  prop(e, out, "events", events);
  prop(e, out, "name", string(e, name));
  prop(e, out, "vendor", number(e, id.vendor));
  prop(e, out, "product", number(e, id.product));
  prop(e, out, "eventSize", number(e, sizeof(input_event)));
  return out;
}
static napi_value activeKeys(napi_env e, napi_callback_info info) {
  napi_value a[1];
  if (!args(e, info, a, 1))
    return nullptr;
  int fd = integer(e, a[0]);
  if (fd == std::numeric_limits<int>::min())
    return nullptr;
  unsigned char bits[(KEY_MAX + 8) / 8] = {};
  if (ioctl(fd, EVIOCGKEY(sizeof(bits)), bits) < 0)
    return fail(e, "EVIOCGKEY");
  napi_value list;
  napi_create_array(e, &list);
  int n = 0;
  for (int i = 0; i <= KEY_MAX; i++)
    if (bit(bits, i))
      napi_set_element(e, list, n++, number(e, i));
  return list;
}
static napi_value grab(napi_env e, napi_callback_info info) {
  napi_value a[2];
  if (!args(e, info, a, 2))
    return nullptr;
  int fd = integer(e, a[0]);
  if (fd == std::numeric_limits<int>::min())
    return nullptr;
  bool wanted = false;
  if (napi_get_value_bool(e, a[1], &wanted) != napi_ok) {
    napi_throw_type_error(e, nullptr, "Grab flag must be boolean");
    return nullptr;
  }
  if (ioctl(fd, EVIOCGRAB, wanted ? 1 : 0) < 0)
    return fail(e, "EVIOCGRAB");
  return number(e, 0);
}
static napi_value lockFd(napi_env e, napi_callback_info info) {
  napi_value a[1];
  if (!args(e, info, a, 1))
    return nullptr;
  int fd = integer(e, a[0]);
  if (fd == std::numeric_limits<int>::min())
    return nullptr;
  if (flock(fd, LOCK_EX | LOCK_NB) < 0)
    return fail(e, "flock");
  return number(e, 0);
}
static napi_value create(napi_env e, napi_callback_info info) {
  napi_value a[3];
  size_t argc = 3;
  napi_get_cb_info(e, info, &argc, a, nullptr, nullptr);
  if (argc < 2) { napi_throw_type_error(e, nullptr, "Missing native arguments"); return nullptr; }
  char name[80] = {};
  size_t len = 0;
  bool arr = false;
  napi_valuetype kind;
  napi_typeof(e, a[0], &kind);
  napi_is_array(e, a[0], &arr);
  if (kind != napi_object || arr ||
      napi_get_value_string_utf8(e, a[1], nullptr, 0, &len) != napi_ok ||
      len >= sizeof(name) || len == 0) {
    napi_throw_type_error(
        e, nullptr,
        "Capabilities object and device name shorter than80bytes required");
    return nullptr;
  }
  napi_get_value_string_utf8(e, a[1], name, sizeof(name), &len);
  int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK | O_CLOEXEC);
  if (fd < 0)
    return fail(e, "open /dev/uinput");
  napi_value names;
  uint32_t length;
  if (napi_get_property_names(e, a[0], &names) != napi_ok) {
    close(fd);
    napi_throw_type_error(e, nullptr, "Invalid capability object");
    return nullptr;
  }
  napi_get_array_length(e, names, &length);
  for (uint32_t i = 0; i < length; i++) {
    napi_value key, values;
    napi_get_element(e, names, i, &key);
    char typeText[20] = {};
    napi_get_value_string_utf8(e, key, typeText, sizeof(typeText), &len);
    int type = 0;
    for (const char *digit = typeText; *digit; ++digit) {
      if (*digit < '0' || *digit > '9' || type > EV_MAX) { type = -1; break; }
      type = type * 10 + (*digit - '0');
    }
    if (std::to_string(type) != typeText ||
        (type != EV_KEY && type != EV_REL && type != EV_MSC && type != EV_LED &&
         type != EV_SW && type != EV_REP && type != EV_SND && type != EV_ABS)) {
      close(fd);
      napi_throw_type_error(e, nullptr,
                            "Unsupported virtual capability event type");
      return nullptr;
    }
    napi_get_property(e, a[0], key, &values);
    uint32_t count = 0;
    bool list = false;
    napi_is_array(e, values, &list);
    if (!list || napi_get_array_length(e, values, &count) != napi_ok ||
        count > KEY_MAX + 1) {
      close(fd);
      napi_throw_type_error(e, nullptr,
                            "Capabilities must contain bounded code arrays");
      return nullptr;
    }
    if (type == EV_SYN || type == EV_FF) {
      close(fd);
      napi_throw_error(e, nullptr, "Unsupported virtual input event type");
      return nullptr;
    }
    if (ioctl(fd, UI_SET_EVBIT, type) < 0) {
      int saved = errno;
      close(fd);
      errno = saved;
      return fail(e, "UI_SET_EVBIT");
    }
    for (uint32_t j = 0; j < count; j++) {
      napi_value value;
      napi_get_element(e, values, j, &value);
      int code = integer(e, value);
      if (code < 0 || code > KEY_MAX) {
        close(fd);
        napi_throw_type_error(e, nullptr, "Invalid capability code");
        return nullptr;
      }
      int command = type == EV_ABS ? UI_SET_ABSBIT
                    : type == EV_KEY   ? UI_SET_KEYBIT
                    : type == EV_REL ? UI_SET_RELBIT
                    : type == EV_MSC ? UI_SET_MSCBIT
                    : type == EV_LED ? UI_SET_LEDBIT
                    : type == EV_SW  ? UI_SET_SWBIT
                                     : 0;
      if (type == EV_ABS) {
        napi_value values;
        bool array = false;
        uint32_t count = 0;
        if (code > ABS_MAX || argc < 3 ||
            napi_get_named_property(e, a[2], std::to_string(code).c_str(), &values) != napi_ok ||
            napi_is_array(e, values, &array) != napi_ok || !array ||
            napi_get_array_length(e, values, &count) != napi_ok || count != 6) {
          close(fd); napi_throw_type_error(e, nullptr, "Absolute axis metadata required"); return nullptr;
        }
        int32_t fields[6];
        for (int n = 0; n < 6; ++n) {
          napi_value value; double number;
          napi_get_element(e, values, n, &value);
          if (napi_get_value_double(e, value, &number) != napi_ok || !std::isfinite(number) ||
              std::floor(number) != number || number < -2147483648.0 || number > 2147483647.0) {
            close(fd); napi_throw_type_error(e, nullptr, "Invalid absolute axis metadata"); return nullptr;
          }
          fields[n] = static_cast<int32_t>(number);
        }
        uinput_abs_setup setup{}; setup.code = code;
        setup.absinfo = {fields[0],fields[1],fields[2],fields[3],fields[4],fields[5]};
        if (ioctl(fd, UI_ABS_SETUP, &setup) < 0) {
          int saved=errno;close(fd);errno=saved;return fail(e,"UI_ABS_SETUP");
        }
      }
      if (command && ioctl(fd, command, code) < 0) {
        int saved = errno;
        close(fd);
        errno = saved;
        return fail(e, "uinput capability");
      }
    }
  }
  uinput_setup setup{};
  setup.id.bustype = BUS_VIRTUAL;
  setup.id.vendor = 1;
  setup.id.product = 1;
  snprintf(setup.name, sizeof(setup.name), "%s", name);
  if (ioctl(fd, UI_DEV_SETUP, &setup) < 0 || ioctl(fd, UI_DEV_CREATE) < 0) {
    int saved = errno;
    close(fd);
    errno = saved;
    return fail(e, "create uinput");
  }
  return number(e, fd);
}
static napi_value destroy(napi_env e, napi_callback_info info) {
  napi_value a[1];
  if (!args(e, info, a, 1))
    return nullptr;
  int fd = integer(e, a[0]);
  if (fd == std::numeric_limits<int>::min())
    return nullptr;
  int result = ioctl(fd, UI_DEV_DESTROY);
  int saved = errno;
  close(fd);
  if (result < 0) {
    errno = saved;
    return fail(e, "destroy uinput");
  }
  return number(e, 0);
}
static napi_value init(napi_env e, napi_value exports) {
  napi_property_descriptor methods[] = {
      {"capabilities", 0, capabilities, 0, 0, 0, napi_default, 0},
      {"activeKeys", 0, activeKeys, 0, 0, 0, napi_default, 0},
      {"grab", 0, grab, 0, 0, 0, napi_default, 0},
      {"lock", 0, lockFd, 0, 0, 0, napi_default, 0},
      {"createUinput", 0, create, 0, 0, 0, napi_default, 0},
      {"destroyUinput", 0, destroy, 0, 0, 0, napi_default, 0}};
  napi_define_properties(e, exports, 6, methods);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
