var f,g;
var db;
var template;


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

g = $rdf.graph();
f = $rdf.fetcher(g);

var store = new rdfstore.Store(function(err, store) {
  // the new store is ready
  console.log('started rdfstore');
});


template      = {};
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
var defaultWallet        = 'https://klaranet.com/etc/wallet/main/wallet#wallet';



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
initialize(template, 'lastConnect');
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
template.settings.seeAlso = [];
template.settings.wallet  = [template.settings.wallet];
template.settings.subs    = [];



angular.module("wallet", [])
.controller("VirtualWallet", function($scope, $http) {


  var subs         = [];

  var webid;
  var wss;
  var socket;

  if (template.settings.wallet.length) {
    wss = 'wss://' + getWallet().split('/')[2];
  }

  $scope.balance     = undefined;
  $scope.selected    = 0;
  $scope.currency    = 'bits';
  $scope.description = 'Virtual Wallet';
  $scope.tx          = [];
  $scope.history     = false;
  $scope.friends     = [];
  $scope.webid       = undefined;


  // get webid from login or cache
  if (localStorage.getItem('webid')) {

    webid = localStorage.getItem('webid');
    template.settings.webid = webid;
    $scope.webid = localStorage.getItem('webid');
    hash = CryptoJS.SHA256(webid).toString();
    var ldpc = getWallet() + 'inbox/' + hash + '/';
    if (wss) {
      connectToSocket(wss,  ldpc , subs);
    }
    template.queue.push(webid);
    fetchAll();
    render();
    daemon();

  } else {
    window.addEventListener('WebIDAuth',function(e) {

      webid = e.detail.user;
      template.settings.webid = webid;
      $scope.webid = e.detail.user;
      console.log('WebID is : ' + webid);

      if(!webid) return;
      hash = CryptoJS.SHA256(webid).toString();
      var ldpc = getWallet() + 'inbox/' + hash + '/';
      if (wss) {
        connectToSocket(wss,  ldpc , subs);
      }

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
      addToArray(template.settings.wallet, wallets[i].object.value);
      addToQueue(template.queue, wallets[i].object.value);
    }

    var seeAlso = g.statementsMatching($rdf.sym(webid), RDFS('seeAlso'), undefined);
    for (i=0; i<seeAlso.length; i++) {
      console.log('seeAlso found : ' + seeAlso[i].object.value);
      addToArray(template.settings.seeAlso, seeAlso[i].object.value);
      addToQueue(template.queue, seeAlso[i].object.value);
    }

    for (i=0; i<$scope.tx.length; i++) {
      //console.log($scope.tx[i].source);
      addToQueue(template.queue, $scope.tx[i].source);
      addToQueue(template.queue, $scope.tx[i].destination);
    }

    for (i=0; i<template.settings.wallet.length; i++) {
      //console.log($scope.tx[i].source);
      addToQueue(template.queue, template.settings.wallet[i]);
    }

  }

  function daemon() {
    var heartbeat = 60;

    setInterval(function() {

      console.log('ping');
      socket.send('ping');

      render();

    }, heartbeat * 1000);
  }


  // FETCH
  function fetchAll() {

    updateQueue();

    //if (template.queue.length === 0) return;

    for (var i=0; i<template.queue.length; i++) {
      console.log(' getting ' + template.queue[i]);
      if (f.getState(template.queue[i].split('#')[0]) === 'unrequested') {
        fetch(template.queue[i]);
      }
    }

  }

  function fetch(uri) {
    console.log('fetching ' + uri);
    console.log(g);

    var why = uri.split('#')[0];
    var l = localStorage.getItem(why);
    if (l) {
      var triples = JSON.parse(l);
      for (var i=0; i<triples.length; i++) {
        var t = triples[i].object.uri;
        if (t) {
          t = $rdf.sym(triples[i].object.value);
        } else {
          t = $rdf.term(triples[i].object.value);
        }

        g.add( $rdf.sym(triples[i].subject.value), $rdf.sym(triples[i].predicate.value), t, $rdf.sym(triples[i].why.value) );
      }
      console.log(triples);
      var index = template.queue.indexOf(uri);
      console.log('length of queue : ' + template.queue.length);
      //if (index > -1) {
      //  console.log('length of queue : ' + template.queue.length);
      //  template.queue.splice(index, 1);
      //}
      render();
      f.requested[why] = 'requested';
      fetchAll();
      return;
    }
    f.nowOrWhenFetched(why, undefined, function(ok, body) {
      cache(uri);
      render();
      fetchAll();
    });
  }

  function cache(uri) {
    console.log('caching ' + uri);
    var why = uri.split('#')[0];
    var triples = g.statementsMatching(undefined, undefined, undefined, $rdf.sym(why));
    localStorage.setItem(why, JSON.stringify(triples));
    console.log(triples);
  }

  function fetchBalance(refresh) {
    if (!refresh && $scope.balance !== undefined) return;

    template.settings.api = g.any($rdf.sym(getWallet()), CURR('api'));
    template.settings.inbox = g.any($rdf.sym(getWallet()), CURR('inbox'));
    if (!template.settings.api) return;
    template.settings.api = template.settings.api.value;
    template.settings.inbox = template.settings.inbox.value;
    if (!template.settings.api) return;

    var hash = CryptoJS.SHA256(template.settings.webid).toString();
    var ldpc = getWallet().substring(0,getWallet().lastIndexOf("/")+1) + 'inbox/' + hash + '/';
    wss = 'wss://' + getWallet().split('/')[2] ;
    if (wss) {
      connectToSocket(wss,  ldpc , template.settings.subs);
    }


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

    template.settings.api = g.any($rdf.sym(getWallet()), CURR('api'));
    if (!template.settings.api) return;
    template.settings.api = template.settings.api.value;
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

    renderNames();

    if (found) {

      if(notify && template.settings.notifications === 'on'){
        var friend = data[0].counterparty;
        for (i=0; i<$scope.friends.length; i++) {
          if ( $scope.friends[i].id === friend && $scope.friends[i].name ) {
            friend = $scope.friends[i].name;
          }
        }

        var notification = new Notification('Incoming Payment! (' + data[0].amount + ') of ' + $scope.balance,
        {'icon': template.settings.notifyIcon,
        "body" : 'With : ' + friend });
        notify = false;

        notification.onclick = function(x) {
          try {
            window.focus();
            document.querySelector('paper-tabs').selected = 0;
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
  renderWallets(refresh);


  //$scope.$apply();

}

function renderLogin() {
  $('webid-login').hide();
}


function renderBalance(refresh) {
  fetchBalance(refresh);
  var description = g.any($rdf.sym(getWallet()), DCT('description'));
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
    var address = g.any(subject, CURR('bitcoin'));

    if (address) {
      address = address.value;

      $('#withdraw').empty().append('<h3>Witdraw</h3>');

      $('#withdraw').append('<p>Address: ' + address + '</p>');
      $('#withdraw').append('<div class="form-group"><input type="text" id="withdrawamount" placeholder="amount" class="form-control"></div>');
      $('#withdraw').append('<p>(Fee = 100)</p>');
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

        function postFile(file, data) {
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

        postFile(template.settings.inbox + hash + '/', wc);


/*
        $.ajax({
          url: template.settings.inbox + hash + '/,meta',
          contentType: "text/turtle",
          type: 'PUT',
          data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
          success: function(result) {
          }
        });
*/
        setTimeout(render, 2000);

      });

    } else {
      console.log('Please add a crypto currency address to your profile to allow withdrawls.');
    }

    console.log(address);

  });

  //$scope.$apply();
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
  //$scope.$apply();
}


function renderWallets() {
  var wallets = [];
  for (var i=0; i<template.settings.wallet.length; i++) {
    var uri = template.settings.wallet[i];
    var label = g.any($rdf.sym(template.settings.wallet[i]), DCT('description'));
    if (label) {
      label = label.value;
    } else {
      label = uri;
    }

    wallets.push({"href": window.location.href.split('?')[0] + '?wallet=' + encodeURIComponent(uri), "label": label});
  }
  $scope.wallets = wallets;
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

    function postFile(file, data) {
      xhr = new XMLHttpRequest();
      xhr.open('POST', file, false);
      xhr.setRequestHeader('Content-Type', 'text/turtle; charset=UTF-8');
      xhr.send(data);
    }

    postFile(template.settings.inbox + hash + '/', wc);
    console.log(wc);
/*
    $.ajax({
      url: template.settings.inbox + hash + '/,meta',
      contentType: "text/turtle",
      type: 'PUT',
      data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
      success: function(result) {
      }
    });
*/
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
  if (!el) return;
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

function getWallet() {
  if (template.init.wallet) return template.init.wallet;
  return template.settings.wallet[0];
}


function connectToSocket(uri, sub, subs) {

  // socket
  if ( subs.indexOf(sub) !== -1 ) {
    console.log('Already subscribed to : ' + sub);
  } else {
    console.log("Opening socket to : " + uri);
    subs.push(sub);
    socket = new WebSocket(uri);

    socket.onopen = function(){
      console.log(this);
      console.log(sub);
      this.send('sub ' + sub);
      template.settings.connection = 'connected';
    };

    socket.close = function(){
      console.log('Connection closed');
      template.settings.connection = 'disconnected';
    };

    socket.onmessage = function(msg){
      console.log('Incoming message : ');
      console.log(msg);

      if (msg === 'pong') return;

      setTimeout(function () { render(true); }, 1000);

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
