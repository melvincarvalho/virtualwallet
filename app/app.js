// Globals
var PROXY = "https://rww.io/proxy.php?uri={uri}";
var TIMEOUT = 90000;
var DEBUG = true;

// Namespaces
var ACL    = $rdf.Namespace("http://www.w3.org/ns/auth/acl#");
var CURR   = $rdf.Namespace("https://w3id.org/cc#");
var CERT   = $rdf.Namespace("http://www.w3.org/ns/auth/cert#");
var DCT    = $rdf.Namespace("http://purl.org/dc/terms/");
var FACE   = $rdf.Namespace("https://graph.facebook.com/schema/~/");
var FOAF   = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
var LDP    = $rdf.Namespace("http://www.w3.org/ns/ldp#");
var OWL    = $rdf.Namespace("http://www.w3.org/2002/07/owl#");
var PIM    = $rdf.Namespace("http://www.w3.org/ns/pim/space#");
var RDF    = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
var RDFS   = $rdf.Namespace("http://www.w3.org/2000/01/rdf-schema#");
var SIOC   = $rdf.Namespace("http://rdfs.org/sioc/ns#");
var SPACE  = $rdf.Namespace("http://www.w3.org/ns/pim/space#");
var UI     = $rdf.Namespace("http://www.w3.org/ns/ui#");

$rdf.Fetcher.crossSiteProxyTemplate=PROXY;

var g = $rdf.graph();
var f = $rdf.fetcher(g);


var template      = {};
document.template = template;


// init
var notify               = false;
var subs                 = [];
var genericphoto         = 'images/generic_photo.png';
var soundURI             = 'http://webid.im/pinglow.mp3';
var defaultLdpc          = 'https://klaranet.com/d/chat/'; // hard code for now until more websockets are there
var defaultIcon          = 'images/money.png';
var defaultInbox         = 'https://klaranet.com/d/user/';
var defaultNotifications = 'on';
var defaultSound         = 'https://raw.githubusercontent.com/schildbach/bitcoin-wallet/master/wallet/res/raw/coins_received.wav';
var defaultTime          = 5000;
var defaultWallet        = 'https://klaranet.com/d/user/';



function initialize(template, key, init) {
  var param = getParam(key);
  if (!template.init) {
    template.init = {};
  }
  if (!template.settings) {
    template.settings = {};
  }
  template.init[key] = param;
  if (param) {
    template.settings[key] = param;
  } else {
    template.settings[key] = init;
  }
}


initialize(template, 'api', 'http://klaranet.com/api/v1/');
initialize(template, 'inbox', defaultInbox);
initialize(template, 'ldpc');
initialize(template, 'notifications', defaultNotifications);
initialize(template, 'notifyIcon', defaultIcon);
initialize(template, 'notifySound', defaultSound);
initialize(template, 'notifyTime', defaultTime);
initialize(template, 'type');
initialize(template, 'wallet', defaultWallet);
initialize(template, 'webid');
initialize(template, 'wss');

template.queue = [];


angular.module("wallet", [])
.controller("VirtualWallet", function($scope, $http) {


  var subs         = [];

  var webid;

  var wss = 'wss://' + template.settings.wallet.split('/')[2];

  $scope.balance  = undefined;
  $scope.selected = 0;
  $scope.currency = 'bits';
  $scope.tx       = [];
  $scope.history  = false;
  $scope.friends  = [];
  $scope.webid    = undefined;


  // get webid from login or cache
  if (localStorage.getItem('webid')) {

    webid = localStorage.getItem('webid');
    $scope.webid = localStorage.getItem('webid');
    hash = CryptoJS.SHA256(webid).toString();
    var ldpc = template.settings.wallet + hash + '/';
    connectToSocket(wss,  ldpc +',meta', subs);
    template.queue.push(webid);
    fetchAll();
    render();
    daemon();

  } else {
    window.addEventListener('WebIDAuth',function(e) {

      webid = e.detail.user;
      $scope.webid= e.detail.user;
      console.log('WebID is : ' + webid);

      if(!webid) return;
      hash = CryptoJS.SHA256(webid).toString();
      var ldpc = template.settings.wallet + hash + '/';
      connectToSocket(wss,  ldpc +',meta', subs);

      localStorage.setItem('webid', e.detail.user);
      template.queue.push(webid);
      fetchAll();
      render();
      daemon();

    });
  }

  addEvents();


  // QUEUE
  function updateQueue() {
    var i;
    console.log('updating queue');

    var knows = g.statementsMatching($rdf.sym(webid), FOAF('knows'), undefined);
    for (i=0; i<knows.length; i++) {
      //console.log(knows[i].object.uri);
      addToFriends($scope.friends, {id: knows[i].object.value, label: knows[i].object.value});
      addToQueue(template.queue, knows[i].object.uri);
    }

    var wallets = g.statementsMatching($rdf.sym(webid), CURR('wallet'), undefined);
    for (i=0; i<wallets.length; i++) {
      console.log('wallet found : ' + wallets[i].object.value);
      template.settings.wallet = wallets[i].object.value;
      addToQueue(template.queue, wallets[i].object.value);
    }

    for (i=0; i<$scope.tx.length; i++) {
      //console.log($scope.tx[i].source);
      addToQueue(template.queue, $scope.tx[i].source);
      addToQueue(template.queue, $scope.tx[i].destination);
    }

  }

  function daemon() {
		var heartbeat = 60;

		setInterval(function() {

			console.log('ping');

			render();

	  }, heartbeat * 1000);
	}


  // FETCH
  function fetchAll() {

    updateQueue();

    //if (template.queue.length === 0) return;

    for (var i=0; i<template.queue.length; i++) {
      if (f.getState(template.queue[i].split('#')[0]) === 'unrequested') {
        fetch(template.queue[i]);
      }
    }

  }

  function fetch(uri) {
    console.log('fetching ' + uri);
    f.nowOrWhenFetched(uri.split('#')[0],undefined, function(ok, body) {
       render();
       fetchAll();
    });
  }

  function fetchBalance(refresh) {
    if (!refresh && $scope.balance !== undefined) return;

    template.settings.api = g.any($rdf.sym(template.settings.wallet), CURR('api'));
    if (!template.settings.api) return;
    template.settings.api = template.settings.api.uri;

    // get balance
    var balanceURI = template.settings.api + 'balance?uri=' + encodeURIComponent(webid);
    $http.get(balanceURI).
    success(function(data, status, headers, config) {
      $scope.balance = data.amount;
    }).
    error(function(data, status, headers, config) {
      // log error
      console.log(data);
    });
  }


  function fetchTx(refresh) {
    if (!refresh && $scope.tx.length !== 0) return;

    if (!template.settings.api) return;

    // get history
    var txURI =  template.settings.api + 'tx?uri=' + encodeURIComponent(webid);
    var jqxhr = $.ajax( txURI )
    .done(function(data) {

      var found = false;

      console.log('num cached tx : ' + $scope.tx.length);
      console.log('num recieved tx : ' + data.length);

      var amount;
      for( var i=0; i<data.length; i++) {
        data[i].counterparty = data[i].source;
        data[i].parity = 'plus';
        if (data[i].counterparty === webid) {
          data[i].counterparty = data[i].destination;
          data[i].parity = 'minus';
        }
        if (data[i].counterparty) {
          //console.log('Fetching ' + data[i].counterparty.split('#')[0]);
          //addToQueue(data[i].counterparty);
          /*
          f.nowOrWhenFetched(data[i].counterparty.split('#')[0],undefined, function(ok, body) {
             renderNames();
          });
          */
        }
        amount = data[i].amount;

        var exists = false;
        for (var j=0; j<$scope.tx.length; j++) {
          if ($scope.tx[j] && $scope.tx[j]['@id'] === data[i]['@id']) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          $scope.tx.unshift(data[i]);
          found = true;
          $scope.$apply();
        }
      }


      if (found) {

        if(notify && template.settings.notifications === 'on'){
          var notification = new Notification('Incoming Payment! (' + data[0].amount + ') of ' + $scope.balance,
          {'icon': template.settings.notifyIcon,
          "body" : 'With : ' + data[0].counterparty });
          notify = false;

          notification.onclick = function(x) {
            try {
              window.focus();
              this.cancel();
            }
            catch (ex) {
            }
          };

          playSound(template.settings.notifySound);

          setTimeout(function(){
            notification.close();
          }, template.settings.notifyTime);

        }

      }

    })
    .fail(function() {
      console.log('could not get tx history');
    });

  }


  // RENDER
  function render(refresh) {
    renderLogin(refresh);
    renderBalance(refresh);
    renderTx(refresh);
    renderPay(refresh);
    renderNames(refresh);

    document.querySelector('paper-tabs').selected = 0;

    $scope.$apply();

  }

  function renderLogin() {
    $('webid-login').hide();
  }


  function renderBalance(refresh) {
    fetchBalance(refresh);
    var description = g.any($rdf.sym(template.settings.wallet), DCT('description'));
    if (description) {
      $scope.description = description.value;
    }
    console.log('description : ' + description);
  }

  function renderTx(refresh) {
    fetchTx(refresh);
  }

  function renderPay() {

    // fetch user data
    f.nowOrWhenFetched(webid.split('#')[0],undefined,function(ok, body){

      //var person = g.statementsMatching($rdf.sym(webid), RDF('type'), FOAF('Person'))[0];

      //console.log(person);

      //var subject = person.subject;
      subject = $rdf.sym(webid);

      var name = g.any(subject, FOAF('name'));
      var address = g.any(subject, CURR('bitmark')) || g.any(subject, CURR('bitcoin'));
/*
      var knows = g.statementsMatching($rdf.sym(webid), FOAF('knows'), undefined);
      if ( knows.length > 0 ) {
        for (var i=0; i<knows.length; i++) {
          var know = knows[i];
          //console.log(know.object.value);
          $scope.friends.push({id: know.object.value, label: know.object.value});
          if (know.object.value) {
            f.nowOrWhenFetched(know.object.value.split('#')[0],undefined, function(ok, body) {
               renderNames();
            });
          }
        }
        $scope.friend = $scope.friends[0];


      }
*/
      if (address) {
        address = address.value;

        $('#withdraw').empty().append('<hr><br>');
        $('#withdraw').text('Address: ' + address);

        $('#withdraw').append('<div class="form-group"><input type="text" id="withdrawamount" placeholder="amount" class="form-control"></div>');
        $('#withdraw').append('<button id="withdrawbutton" type="button" class="btn btn-default">Withdraw</button>');

        $( "#withdrawbutton" ).click(function( event ) {
          var source = $('#source').val();
          var destination = $('#destination').val();
          var amount = $('#withdrawamount').val();

          var err = '';

          if(!amount) err +=('Please enter an amount\n');

          if (isNaN(amount)) err += ('Amount must be a number');
          amount = parseFloat(amount);

          if(err !== '') {
            alert(err);
            return false;
          }

          console.log(amount);
          console.log(wc);

          var hash = CryptoJS.SHA256(webid).toString();

          function putFile(file, data) {
            xhr = new XMLHttpRequest();
            xhr.open('PUT', file, false);
            xhr.setRequestHeader('Content-Type', 'text/turtle; charset=UTF-8');
            xhr.send(data);
          }


          var wc = '<>  a <https://w3id.org/cc#Credit> ;\n';
          wc += '  <https://w3id.org/cc#source> \n    <' + webid + '> ;\n';
          wc += '  <https://w3id.org/cc#destination> \n    <' + address + '> ;\n';
          wc += '  <https://w3id.org/cc#amount> "' + amount + '" ;\n';
          wc += '  <https://w3id.org/cc#currency> \n    <https://w3id.org/cc#bit> .\n';

          putFile(template.settings.inbox + hash + '/1', wc);


          $.ajax({
            url: template.settings.inbox + hash + '/,meta',
            contentType: "text/turtle",
            type: 'PUT',
            data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
            success: function(result) {
            }
          });

          setTimeout(render, 2000);

        });

      } else {
        console.log('Please add a crypto currency address to your profile to allow withdrawls.');
      }

      console.log(address);

    });

    $scope.$apply();
  }

  function renderNames() {
    var i;
    var name;
    for (i=0; i<$scope.tx.length; i++) {
      name = g.any( $rdf.sym($scope.tx[i].counterparty), FOAF('name') );
      if (name) {
        $scope.tx[i].name = name.value;
      }
    }
    for (i=0; i<$scope.friends.length; i++) {
      name = g.any( $rdf.sym($scope.friends[i].id), FOAF('name') );
      if (name) {
        $scope.friends[i].name = name.value;
      }
    }
    $scope.$apply();
  }


  function addEvents() {
    $( "#sendbutton" ).click(function( event ) {
      var source = $('#source').val();
      var destination = $('#friendsselect').val();
      destination = $scope.friend.id;
      var amount = $('#sendamount').val();

      var err = '';

      if(!amount) err +=('Please enter an amount\n');

      if (isNaN(amount)) err += ('Amount must be a number');
      amount = parseFloat(amount);

      if(err !== '') {
        alert(err);
        return false;
      }

      console.log(amount);

      var wc = '<>  a <https://w3id.org/cc#Credit> ;\n';
      wc += '  <https://w3id.org/cc#source> \n    <' + webid + '> ;\n';
      wc += '  <https://w3id.org/cc#destination> \n    <' + destination + '> ;\n';
      wc += '  <https://w3id.org/cc#amount> "' + amount + '" ;\n';
      wc += '  <https://w3id.org/cc#currency> \n    <https://w3id.org/cc#bit> .\n';


      var hash = CryptoJS.SHA256(webid).toString();

      function putFile(file, data) {
        xhr = new XMLHttpRequest();
        xhr.open('PUT', file, false);
        xhr.setRequestHeader('Content-Type', 'text/turtle; charset=UTF-8');
        xhr.send(data);
      }

      putFile(template.settings.inbox + hash + '/2', wc);
      console.log(wc);

      $.ajax({
        url: template.settings.inbox + hash + '/,meta',
        contentType: "text/turtle",
        type: 'PUT',
        data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
        success: function(result) {
        }
      });

    });

  }




  // HELPER
  function addToArray(array, el) {
    if (!array) return;
    if (array.indexOf(el) === -1) {
      array.push(el);
    }
  }

  function addToQueue(array, el) {
    if (!array) return;
    if (array.indexOf(el) === -1) {
      array.push(el);
    }
  }

  function addToFriends(array, el) {
    if (!array) return;
    for (var i=0; i<array.length; i++) {
      if (array[i].id === el.id) {
        return;
      }
    }
    array.push(el);
  }


  function playSound(uri) {
    var sound = new Howl({
      urls: [uri],
      volume: 0.9
    }).play();
    navigator.vibrate(500);
  }


  $scope.modal = function() {
    console.info('toggling modal');
    $scope.printSettings = JSON.stringify(template.settings, null, 2);
    $('#modal').toggle();
  };


  function connectToSocket(uri, sub, subs) {

    // socket
    if ( subs.indexOf(sub) !== -1 ) {
      console.log('Already subscribed to : ' + sub);
    } else {
      console.log("Opening socket to : " + uri);
      subs.push(sub);
      var socket = new WebSocket(uri);

      socket.onopen = function(){
        console.log(this);
        console.log(sub);
        this.send('sub ' + sub);
      };

      socket.onmessage = function(msg){
        console.log('Incoming message : ' + msg);

        render(true);

        Notification.requestPermission(function (permission) {
          // If the user is okay, let's create a notification
          if (permission === "granted") {
            notify = true;
          }
        });
      };
    }
  }

});
