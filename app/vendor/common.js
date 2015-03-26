var isInteger = function(a) {
    return ((typeof a !== 'number') || (a % 1 !== 0)) ? false : true;
};

stripSchema = function (url) {
    url = url.split('://');
    var schema = (url[0].substring(0, 4) == 'http')?url[0]:'';
    var path = (url[1].length > 0)?url[1]:url[0];
    return url[0]+'/'+url[1];
};

dirname = function(path) {
    return path.replace(/\\/g, '/').replace(/\/[^\/]*\/?$/, '');
};

basename = function(path) {
    if (path.substring(path.length - 1) == '/') {
      path = path.substring(0, path.length - 1);
    }

    var a = path.split('/');
    return a[a.length - 1];
};

function getParam(name) {
  name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
  var regexS = "[\\?&]"+name+"=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(window.location.href);
  if( results == null ) {
    return "";
  } else {
    return decodeURIComponent(results[1]);
  }
}

// unquote string (utility)
function unquote(value) {
  if (value.charAt(0) == '"' && value.charAt(value.length - 1) == '"') {
      return value.substring(1, value.length - 1);
  }
  return value;
}

function parseLinkHeader(header) {
  var linkexp = /<[^>]*>\s*(\s*;\s*[^\(\)<>@,;:"\/\[\]\?={} \t]+=(([^\(\)<>@,;:"\/\[\]\?={} \t]+)|("[^"]*")))*(,|$)/g;
  var paramexp = /[^\(\)<>@,;:"\/\[\]\?={} \t]+=(([^\(\)<>@,;:"\/\[\]\?={} \t]+)|("[^"]*"))/g;

  var matches = header.match(linkexp);
  var rels = {};
  for (var i = 0; i < matches.length; i++) {
    var split = matches[i].split('>');
    var href = split[0].substring(1);
    var ps = split[1];
    var link = {};
    link.href = href;
    var s = ps.match(paramexp);
    for (var j = 0; j < s.length; j++) {
      var p = s[j];
      var paramsplit = p.split('=');
      var name = paramsplit[0];
      link[name] = unquote(paramsplit[1]);
    }

    if (link.rel !== undefined) {
      rels[link.rel] = link;
    }
  }

  return rels;
}

// notifications
(function($){
  var config = window.NotifierjsConfig = {
    defaultTimeOut: 5000,
    position: ["top", "right"],
    notificationStyles: {
      padding: "12px 18px",
      margin: "0 0 6px 0",
      backgroundColor: "#fff",
      opacity: 1,
      color: "#000",
      font: "normal 15px 'Droid Sans', sans-serif",
      borderRadius: "3px",
      boxShadow: "#999 0 0 12px",
      //width: "300px",
      height: "50px"
    },
    notificationStylesHover: {
      opacity: 1,
      boxShadow: "#000 0 0 12px"
    },
    container: $("<div></div>")
  };

  $(function() {
    config.container.css("position", "fixed");
    config.container.css("z-index", 9999);
    config.container.css(config.position[0], "12px");
    config.container.css(config.position[1], "12px");
    config.container.appendTo(document.body);
  });

  function getNotificationElement() {
    return $("<div>").css(config.notificationStyles).bind('hover', function() {
      $(this).css(config.notificationStylesHover);
    }, function() {
      $(this).css(config.notificationStyles);
    });
  }

  var Notifier = window.Notifier = {};

  Notifier.notify = function(message, title, iconUrl, timeOut) {
    var notificationElement = getNotificationElement();

    timeOut = timeOut || config.defaultTimeOut;

    if (iconUrl) {
      var iconElement = $("<i>");
      iconElement.attr('class', iconUrl);
      iconElement.addClass('small');
      iconElement.css({
        display: "inline-block",
        verticalAlign: "middle"
      });
      notificationElement.append(iconElement);
    }

    var textElement = $("<div/>").css({
      display: 'inline-block',
      verticalAlign: 'middle',
      padding: '0 12px'
    });

    if (title) {
      var titleElement = $("<div/>");
      titleElement.append(document.createTextNode(title));
      titleElement.css("font-weight", "bold");
      textElement.append(titleElement);
    }

    if (message) {
      var messageElement = $("<div/>");
      messageElement.addClass("truncate")
      messageElement.append(document.createTextNode(message));
      textElement.append(messageElement);
    }

    setTimeout(function() {
      notificationElement.animate({ opacity: 0 }, 400, function(){
        notificationElement.remove();
      });
    }, timeOut);

    notificationElement.bind("click", function() {
      notificationElement.hide();
    });

    notificationElement.append(textElement);
    config.container.prepend(notificationElement);
  };

  Notifier.info = function(message, title) {
    Notifier.notify(message, title, "mdi-action-info-outline blue-text");
  };
  Notifier.warning = function(message, title) {
    Notifier.notify(message, title, "mdi-alert-warning orange-text");
  };
  Notifier.error = function(message, title) {
    Notifier.notify(message, title, "mdi-action-highlight-remove red-text");
  };
  Notifier.success = function(message, title) {
    Notifier.notify(message, title, "mdi-action-done green-text");
  };

}(jQuery));