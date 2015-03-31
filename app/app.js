angular.module("wallet", [])
.controller("VirtualWallet", function($scope, $http) {


  // init
  var selected = 0;
  var notifyIcon  = getParam('notifyIcon')  || "images/money.png";
  var notifySound = getParam('notifySound') || 'https://raw.githubusercontent.com/schildbach/bitcoin-wallet/master/wallet/res/raw/coins_received.wav';
  var notifyTime  = getParam('notifyTime')  || 10000;

  // Globals
  var __kb;
  var __profile;
  var PROXY = "https://rww.io/proxy.php?uri={uri}";
  var AUTH_PROXY = "https://rww.io/auth-proxy?uri=";
  var TIMEOUT = 90000;
  var DEBUG = true;
  // Namespaces
  var RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
  var RDFS = $rdf.Namespace("http://www.w3.org/2000/01/rdf-schema#");
  var FOAF = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
  var OWL = $rdf.Namespace("http://www.w3.org/2002/07/owl#");
  var SPACE = $rdf.Namespace("http://www.w3.org/ns/pim/space#");
  var UI = $rdf.Namespace("http://www.w3.org/ns/ui#");
  var DCT = $rdf.Namespace("http://purl.org/dc/terms/");
  var CERT = $rdf.Namespace("http://www.w3.org/ns/auth/cert#");
  var ACL = $rdf.Namespace("http://www.w3.org/ns/auth/acl#");

  $rdf.Fetcher.crossSiteProxyTemplate=PROXY;

  var g = $rdf.graph();
  var f = $rdf.fetcher(g);
  var notify = false;


  var subs     = [];

  var template     = {};
  template.tx      = [];
  template.balance = 0;


  var api = getParam('api') || 'http://klaranet.com/api/v1/';
  var paymentProvider = getParam('paymentProvider') || 'https://klaranet.com/d/user/';

  var webid;

  var hash = '5edbedfea2005c9feca6c014a6d8b2237d1e54c4113155621e2d7ecb7427c42b';
  var ldpc = paymentProvider + hash + '/';
  var wss = 'wss://' + ldpc.split('/')[2];


  $scope.balance  = 0;
  $scope.selected = 1;
  $scope.currency = 'bits';
  $scope.tx       = [];


  // Event listener for login (from child iframe)
  var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
  var eventListener = window[eventMethod];
  var messageEvent = eventMethod == "attachEvent" ? "onmessage" : "message";

  // Listen to message from child window
  eventListener('WebIDAuth',function(e) {

    webid = e.detail.user;
    console.log('WebID is : ' + webid);

    if(!webid) return;
    hash = CryptoJS.SHA256(webid).toString();
    var ldpc = paymentProvider + hash + '/';
    connectToSocket(wss,  ldpc +',meta', subs);

    localStorage.setItem('webid', e.detail.user);
    render();



    function render() {
      $('webid-login').hide();


      // get balance
      var balanceURI = api + 'balance?uri=' + encodeURIComponent(webid);
      $http.get(balanceURI).
      success(function(data, status, headers, config) {
        $scope.balance = data['amount'];
      }).
      error(function(data, status, headers, config) {
        // log error
        console.log(data);
      });










      // get history
      var txURI =  api + 'tx?uri=' + encodeURIComponent(webid);
      var jqxhr = $.ajax( txURI )
      .done(function(data) {

        $('#txmain').hide();

        var found = false;

        console.log('num cached tx : ' + template.tx.length);
        console.log('num recieved tx : ' + data.length);

        var amount;
        for( var i=0; i<data.length; i++) {
          data[i].counterparty = data[i]['source'];
          data[i].parity = 'plus';
          if (data[i].counterparty === webid) {
            data[i].counterparty = data[i]['destination'];
            data[i].parity = 'minus';
          }
          amount = data[i]['amount'];

          var exists = false;
          for (var j=0; j<template.tx.length; j++) {
            if (template.tx[j] && template.tx[j]['@id'] === data[i]['@id']) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            template.tx.push(data[i]);
            $scope.tx.unshift(data[i]);
            found = true;
          }
        }


        if (found) {

          if(notify){
            var notification = new Notification('Incoming Payment! (' + data[0].amount + ') of ' + $scope.balance,
            {'icon': notifyIcon,
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

            function playSound(uri) {
              var sound = new Howl({
                urls: [uri],
                volume: 0.9
              }).play();
              navigator.vibrate(500);
            }

            playSound(notifySound);

            setTimeout(function(){
              notification.close()
            }, notifyTime);

          }

        }

      })
      .fail(function() {
        console.log('could not get tx history');
      });
      document.querySelector('paper-tabs').selected = 1;

      renderpay();
    }



    function renderpay() {

      // fetch user data
      f.nowOrWhenFetched(webid.split('#')[0],undefined,function(ok, body){
        var FOAF = $rdf.Namespace("http://xmlns.com/foaf/0.1/");
        var CURR = $rdf.Namespace("https://w3id.org/cc#");
        var RDF = $rdf.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");

        var person = g.statementsMatching(undefined, RDF('type'), FOAF('Person'))[0];

        console.log(person);

        var subject = person.subject;

        var name = g.any(subject, FOAF('name'));
        var address = g.any(subject, CURR('bitmark')) || g.any(subject, CURR('bitcoin'));

        var knows = g.statementsMatching(undefined, FOAF('knows'), undefined);
        if ( knows.length > 0 ) {
          var sel = $('<select id="friendsselect">');
          sel.append($("<option>").attr('value','Friends').text('Friends'));
          for (var i=0; i<knows.length; i++) {
            var know = knows[i];
            console.log(know.object.value);
            sel.append($("<option>").attr('value',know.object.value).text(know.object.value));
          }
          $('#friends').empty().append(sel);

          $('#friends').append('<div class="form-group"><input type="text" id="sendamount" size="80" placeholder="send" class="form-control"></div>');
          $('#friends').append('<button id="sendbutton" type="button" class="btn btn-default">Send</button>');
        }

        if (address) {
          address = address.value;

          $('#withdraw').empty().append('<hr><br>');
          $('#withdraw').text('Address: ' + address);

          $('#withdraw').append('<div class="form-group"><input type="text" id="withdrawamount" placeholder="amount" class="form-control"></div>');
          $('#withdraw').append('<button id="withdrawbutton" type="button" class="btn btn-default">Withdraw</button>');


          $( "#sendbutton" ).click(function( event ) {
            var source = $('#source').val();
            var destination = $('#friendsselect').val();
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



            $('#webcredit').text(wc);


            var hash = CryptoJS.SHA256(webid).toString();

            function putFile(file, data) {
              xhr = new XMLHttpRequest();
              xhr.open('PUT', file, false);
              xhr.setRequestHeader('Content-Type', 'text/turtle; charset=UTF-8');
              xhr.send(data);
            }


            putFile(paymentProvider + hash + '/2', wc);


            console.log(wc);

            $.ajax({
              url: paymentProvider + hash + '/,meta',
              contentType: "text/turtle",
              type: 'PUT',
              data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
              success: function(result) {
              }
            });

            setTimeout(render, 3000);


          });


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

            var wc = '<>  a <https://w3id.org/cc#Credit> ;\n';
            wc += '  <https://w3id.org/cc#source> \n    <' + webid + '> ;\n';
            wc += '  <https://w3id.org/cc#destination> \n    <' + address + '> ;\n';
            wc += '  <https://w3id.org/cc#amount> "' + amount + '" ;\n';
            wc += '  <https://w3id.org/cc#currency> \n    <https://w3id.org/cc#bit> .\n';

            $('#webcredit').text(wc);
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

            putFile(paymentProvider + hash + '/1', wc);

            console.log(wc);


            $.ajax({
              url: paymentProvider + hash + '/,meta',
              contentType: "text/turtle",
              type: 'PUT',
              data: '<> <http://www.w3.org/ns/posix/stat#mtime> "'+ Math.floor(Date.now() / 1000) +'" . ',
              success: function(result) {
              }
            });

            setTimeout(render, 2000);

          });


        } else {
          alert('Please add a crypto currency address to your profile to allow withdrawls.');
        }

        console.log(name);
        console.log(address);

      });


    }




    function connectToSocket(socket, sub, subs) {

      // socket
      if ( subs.indexOf(sub) !== -1 ) {
        console.log('Already subscribed to : ' + sub);
      } else {
        console.log("Opening socket to : " + socket);
        subs.push(sub);
        var socket = new WebSocket(socket);

        socket.onopen = function(){
          console.log(this);
          console.log(sub);
          this.send('sub ' + sub);
        }

        socket.onmessage = function(msg){
          console.log('Incoming message : ');
          console.log(msg);
          var today = new Date().toISOString().substr(0,10);

          render();

          Notification.requestPermission(function (permission) {
            // If the user is okay, let's create a notification
            if (permission === "granted") {
              notify = true;
            }
          });
        }
      }
    }



  });



} );
