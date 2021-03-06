function(instance, context) {
    console.log('init VideoChat element');

    function getPromisedMedia(cb, constraints, noFallbackToAudioOnly) {
        if (!navigator.mediaDevices.getUserMedia) {
            return;
        }
        navigator.mediaDevices.getUserMedia(constraints)
            .then(cb)
            .catch(function (error) {
                if (error && error.name == 'DevicesNotFoundError' && constraints.video && !noFallbackToAudioOnly) {
                    constraints.video = false;
                    getPromisedMedia(cb, constraints, true);
                } else {
                    console.log(error.name);
                }
            });
    }

    function initiateMediaStream(cb, constraints, noFallbackToAudioOnly) {
        if (!constraints) {
            constraints = {
                video: true,
                audio: true
            }
        }
        getPromisedMedia(cb, constraints, noFallbackToAudioOnly);
    }

    function establishPeerConnection(sendDescription, onRemoteStream, collectIces) {
        var pc = new RTCPeerConnection({
            'iceServers': [
                {urls: 'stun:stun.l.google.com:19302'},
                {urls: 'stun:stun1.l.google.com:19302'},
                {urls: 'stun:stun2.l.google.com:19302'},
                {urls: 'stun:stun3.l.google.com:19302'},
                {urls: 'stun:stun4.l.google.com:19302'},
                {
                    urls: 'turn:46.101.168.80:3478',
                    credential: 'test',
                    username: 'test'
                }
            ]
        });
        pc.iceCandidatesPool = [];
        pc.cachedRemoteDescription = null;

        pc.onicecandidate = function (evt) {
            if (!evt.candidate) {
                if (collectIces) sendDescription(pc.localDescription);
            }
        };

        pc.onaddstream = function (evt) {
            console.log('stream', evt.stream);
            if (onRemoteStream) onRemoteStream(evt.stream);
        };

        pc.onremovestream = function (evt) {
            console.log('remove', evt);
        };

        pc.onnegotiationneeded = function() {
            console.log('onnegotiationneeded','have remote:',pc.cachedRemoteDescription);
            if(pc.cachedRemoteDescription) {
                pc.setRemoteDescription(new RTCSessionDescription(pc.cachedRemoteDescription), function () {
                    pc.cachedRemoteDescription = null;
                }, logError);
            } else {
                pc.createOffer(function (sdp) {
                    sdp.sdp = enhanceSDP(sdp.sdp, {
                        audioBitrate: instance.data.audioBitrate,
                        videoBitrate: instance.data.videoBitrate,
                        videoFrameRate: instance.data.videoFrameRate});
                    pc.setLocalDescription(sdp, function () {
                    }, logError);
                }, logError);
            }
        };

        pc.oniceconnectionstatechange = function() {
            console.log('ice connection:', pc.iceConnectionState);
        };

        pc.onicegatheringstatechange = function() {
            console.log('ice gathering:', pc.iceGatheringState);
        };

        pc.onsignalingstatechange = function() {
            console.log('sig state:', pc.signalingState);
            if (pc.signalingState == "have-remote-offer") {
                pc.createAnswer(function (answer) {
                    answer.sdp = enhanceSDP(answer.sdp, {
                        audioBitrate: instance.data.audioBitrate,
                        videoBitrate: instance.data.videoBitrate,
                        videoFrameRate: instance.data.videoFrameRate});
                    pc.setLocalDescription(new RTCSessionDescription(answer), function () {
                        if (!collectIces) sendDescription(pc.localDescription);
                    }, logError);
                }, logError);
            } else if (!collectIces && pc.signalingState == "have-local-offer") {
                sendDescription(pc.localDescription);
            }
        };

        return pc;
    }

    function publishMyStream(pc, localStream) {
        if (localStream) {
            console.log('added local stream');
            return pc.addStream(localStream);
        } else {
            return null;
        }
    }

    function proceedCandidate(pc, candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    function proceedRemoteSDP(pc, sdp) {
        pc.setRemoteDescription(new RTCSessionDescription(sdp), function () {}, logError);
    }

    /// private
    function logError(error) {
        console.log(error.name + ': ' + error.message);
    }

    function enhanceSDP(sdpStr, enhanceData) {
        var sdpLines = sdpStr.split(/\r\n/);
        var sdpSection = 'header';
        var hitMID = false;
        var sdpStrRet = '';

        for (var sdpIndex in sdpLines) {
            var sdpLine = sdpLines[sdpIndex];

            if (sdpLine.length <= 0)
                continue;

            sdpStrRet += sdpLine;

            if (sdpLine.indexOf("m=audio") === 0) {
                sdpSection = 'audio';
                hitMID = false;
            }
            else if (sdpLine.indexOf("m=video") === 0) {
                sdpSection = 'video';
                hitMID = false;
            }
            else if (sdpLine.indexOf("a=rtpmap") == 0) {
                sdpSection = 'bandwidth';
                hitMID = false;
            }

            if (sdpLine.indexOf("a=mid:") === 0 || sdpLine.indexOf("a=rtpmap") == 0) {
                if (!hitMID) {
                    if ('audio'.localeCompare(sdpSection) == 0) {
                        if (enhanceData.audioBitrate !== undefined) {
                            sdpStrRet += '\r\nb=CT:' + (enhanceData.audioBitrate);
                            sdpStrRet += '\r\nb=AS:' + (enhanceData.audioBitrate);
                        }
                        hitMID = true;
                    }
                    else if ('video'.localeCompare(sdpSection) == 0) {
                        if (enhanceData.videoBitrate !== undefined) {
                            sdpStrRet += '\r\nb=CT:' + (enhanceData.videoBitrate);
                            sdpStrRet += '\r\nb=AS:' + (enhanceData.videoBitrate);
                            if (enhanceData.videoFrameRate !== undefined) {
                                sdpStrRet += '\r\na=framerate:' + enhanceData.videoFrameRate;
                            }
                        }
                        hitMID = true;
                    }
                    else if ('bandwidth'.localeCompare(sdpSection) == 0) {
                        var rtpmapID;
                        rtpmapID = getrtpMapID(sdpLine);
                        if (rtpmapID !== null) {
                            var match = rtpmapID[2].toLowerCase();
                            if (('vp9'.localeCompare(match) == 0 ) || ('vp8'.localeCompare(match) == 0 ) || ('h264'.localeCompare(match) == 0 ) ||
                                ('red'.localeCompare(match) == 0 ) || ('ulpfec'.localeCompare(match) == 0 ) || ('rtx'.localeCompare(match) == 0 )) {
                                if (enhanceData.videoBitrate !== undefined) {
                                    sdpStrRet += '\r\na=fmtp:' + rtpmapID[1] + ' x-google-min-bitrate=' + (enhanceData.videoBitrate) + ';x-google-max-bitrate=' + (enhanceData.videoBitrate);
                                }
                            }

                            if (('opus'.localeCompare(match) == 0 ) || ('isac'.localeCompare(match) == 0 ) || ('g722'.localeCompare(match) == 0 ) || ('pcmu'.localeCompare(match) == 0 ) ||
                                ('pcma'.localeCompare(match) == 0 ) || ('cn'.localeCompare(match) == 0 )) {
                                if (enhanceData.videoBitrate !== undefined) {
                                    sdpStrRet += '\r\na=fmtp:' + rtpmapID[1] + ' x-google-min-bitrate=' + (enhanceData.audioBitrate) + ';x-google-max-bitrate=' + (enhanceData.audioBitrate);
                                }
                            }
                        }
                    }
                }
            }
            sdpStrRet += '\r\n';
        }
        return sdpStrRet;
    }

    function getrtpMapID(line) {
        var findid = new RegExp('a=rtpmap:(\\d+) (\\w+)/(\\d+)');
        var found = line.match(findid);
        return (found && found.length >= 3) ? found : null;
    }

    //-----------------------------------------------------------------------------------

    function connectWowza(url, app, streamName, proceedSdp, proceedCandidate, opened) {
        var connection = instance.data.wowzaConnection;

        connection.streamInfo = {applicationName: app, streamName: streamName, sessionId: "[empty]"};
        connection.playRetryCount = 0;

        connection.ws = new WebSocket(url);
        connection.ws.binaryType = 'arraybuffer';

        connection.ws.onopen = function () {
            console.log("wowzaConnector.ws.onopen");
            if(opened) opened();
        };

        connection.ws.onmessage = function (evt) {
            var msgJSON = JSON.parse(evt.data);
            var msgStatus = Number(msgJSON['status']);
            var msgCommand = msgJSON['command'];

            if (msgStatus == 200) {
                var streamInfoResponse = msgJSON['streamInfo'];
                if (streamInfoResponse !== undefined) {
                    connection.streamInfo.sessionId = streamInfoResponse.sessionId;
                }

                var sdpData = msgJSON['sdp'];
                if (sdpData !== undefined) {
                    if (proceedSdp) proceedSdp(sdpData);
                }

                var iceCandidates = msgJSON['iceCandidates'];
                if (iceCandidates !== undefined) {
                    for (var index in iceCandidates) {
                        if (proceedCandidate) proceedCandidate(iceCandidates[index]);
                    }
                }
            } else if (msgStatus == 514 || msgStatus == 504 || msgStatus == 502) {
                connection.playRetryCount++;
                if (connection.playRetryCount < 10) {
                    setTimeout(connection.play, connection.playRetryCount * 250);
                } else {
                    setTimeout(connection.play, 3000);
                }
            }

            if ('sendResponse'.localeCompare(msgCommand) == 0) {
                if (connection.ws != null)
                    connection.ws.close();
                connection.ws = null;
            }
        };
    }
  
  	function checkStream(streamName, appName, lastCheck) {
      console.log('checking '+appName+':'+streamName);
      
      var xhr1 = new XMLHttpRequest();  

      xhr1.open("GET", 'https://'+context.keys.wowza_host+':8087/v2/servers/_defaultServer_/vhosts/_defaultVHost_/applications/'
                    + appName + '/instances/_definst_/incomingstreams/' + streamName, true);
	  xhr1.setRequestHeader('Accept', 'application/json; charset=utf-8');
      xhr1.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
      xhr1.onload  = function() {
        if (xhr1.response) {
          console.log(xhr1.response);
          if (xhr1.status != 200 && !lastCheck) {
            setTimeout(function() {
              	checkStream(streamName, appName, true);
              }, 10000);
          } else if (xhr1.status != 200 && lastCheck) {
            instance.triggerEvent('noconnection');
          }
        }
      };  

      xhr1.send();
    }

    function sendCandidate(candidate) {
    }

    function sendDescription(sdp) {
        var connection = instance.data.wowzaConnection;
        if (!connection.ws) return;
        if (connection.ws.readyState == 0) {
            setTimeout(function () {
                sendDescription(sdp);
            }, 500);
        } else {
            if (sdp.type == 'offer') {
                connection.ws.send('{"direction":"publish", "command":"sendOffer", "streamInfo":' + JSON.stringify(connection.streamInfo) + ', "sdp":' + JSON.stringify(sdp) + '}');
              setTimeout(function() {
              	checkStream(connection.streamInfo.streamName+'_aac', connection.streamInfo.applicationName, false);
              },5000);
            } else {
                connection.ws.send('{"direction":"play", "command":"sendResponse", "streamInfo":' + JSON.stringify(connection.streamInfo) + ', "sdp":' + JSON.stringify(sdp) + '}');
            }
        }
    }


    function connectWowzaPlay(url, app, streamName, proceedSdp, proceedCandidate, opened) {
        var connection = instance.data.wowzaConnectionPlay;

        connection.streamInfo = {applicationName: app, streamName: streamName, sessionId: "[empty]"};
        connection.playRetryCount = 0;

        connection.ws = new WebSocket(url);
        connection.ws.binaryType = 'arraybuffer';

        connection.ws.onopen = function () {
            console.log("wowzaConnector.ws.onopen", app, streamName);
            if(opened) opened();
        };

        connection.ws.onmessage = function (evt) {
            var msgJSON = JSON.parse(evt.data);
            var msgStatus = Number(msgJSON['status']);
            var msgCommand = msgJSON['command'];

            if (msgStatus == 200) {
                var streamInfoResponse = msgJSON['streamInfo'];
                if (streamInfoResponse !== undefined) {
                    connection.streamInfo.sessionId = streamInfoResponse.sessionId;
                }

                var sdpData = msgJSON['sdp'];
                if (sdpData !== undefined) {

                    instance.data.socketConnection.emit(
                        instance.data.socketConnection.socket, "debug",
                        evt.data,
                        instance.data.controller.fromId);

                    if(!sdpData.sdp.match(/audio/m)) {
                        console.log('NO AUDIO! reconnect in 1s to', instance.data.recv_token);
                        setTimeout(function() {
                            wowza_play(instance.data.recv_token);
                        }, 1000);
                        return;
                    }
                    if (proceedSdp) proceedSdp(sdpData);
                }

                var iceCandidates = msgJSON['iceCandidates'];
                if (iceCandidates !== undefined) {
                    for (var index in iceCandidates) {
                        if (proceedCandidate) proceedCandidate(iceCandidates[index]);
                    }
                }
            } else if (msgStatus == 514 || msgStatus == 504 || msgStatus == 502) {
                connection.playRetryCount++;
                if (connection.playRetryCount < 10) {
                    setTimeout(connection.play, connection.playRetryCount * 250);
                } else {
                    setTimeout(connection.play, 3000);
                }
            }

            if ('sendResponse'.localeCompare(msgCommand) == 0) {
                if (connection.ws != null)
                    connection.ws.close();
                connection.ws = null;
            }
        };
    }

    function sendCandidatePlay(candidate) {
    }

    function sendDescriptionPlay(sdp) {
        var connection = instance.data.wowzaConnectionPlay;
        if (!connection.ws) return;
        if (connection.ws.readyState == 0) {
            setTimeout(function () {
                sendDescription(sdp);
            }, 500);
        } else {
            if (sdp.type == 'offer') {
                connection.ws.send('{"direction":"publish", "command":"sendOffer", "streamInfo":' + JSON.stringify(connection.streamInfo) + ', "sdp":' + JSON.stringify(sdp) + '}');
            } else {
                connection.ws.send('{"direction":"play", "command":"sendResponse", "streamInfo":' + JSON.stringify(connection.streamInfo) + ', "sdp":' + JSON.stringify(sdp) + '}');
            }
        }
    }

    function play() {
        console.log('play',connection);
        var connection = instance.data.wowzaConnectionPlay;
        if (!connection.ws || connection.ws == null) return;
        if (connection.ws.readyState == 0) {
            setTimeout(function () {
                play();
            }, 500);
        } else {
            connection.ws.send('{"direction":"play", "command":"getOffer", "streamInfo":' + JSON.stringify(connection.streamInfo) + '}');
        }
    }

    //-----------------------------------------------------------------------------------

    function decodeJSON(str) {
        try {
            var o = JSON.parse(str);
        } catch (e) {
        }

        if (o instanceof Object && o.constructor.name == 'Object') {
            return o;
        }
    }

    function emit(socket, name) {
        if (socket) {
            socket.send({
                message: "hubSend",
                channel: "interviews",
                data: JSON.stringify({
                    'name': name,
                    'args': Array.prototype.slice.call(arguments, 2)
                })
            });
        } /*else {
            setTimeout(function() {emit(socket, name);}, 1000);
        }*/
    }

    function connect(host, id, actions) {
        if (instance.data.client) {
            console.log('close old hub connection');
            instance.data.client.disconnect();
            instance.data.client = null;
        }

        instance.data.client = new BroadcastHubClient({
            server: 'https://'+host+':8443/sockets/',
            auth: id
        });

        setTimeout(function() {
            instance.data.client.subscribe('interviews');
            console.log('SockJS transport', instance.data.client.client.transport);
        }, 4000);

        if (actions.connected) actions.connected();

        instance.data.client.on('message', function (channel, message) {
            console.log('message', message);

            var matched = message.match(/(\d*x\d*)/);
            if (message.match(/online:/)) {
                actions["msg:online"](matched[1]); return;
            } else if (message.match(/offline:/)) {
                actions["msg:offline"](matched[1]); return;
            }

            var msg = decodeJSON(message);

            if (typeof msg.name == 'string' && Array.isArray(msg.args)) {
                var event = "msg:notify:" + msg.name;

                console.log(event, typeof actions[event] );

                if (typeof actions[event] == 'function') {
                    actions[event].apply(actions, msg.args);
                }
            }

        });        

        return instance.data.client;
    }

    function stop() {
        if (instance.data.videoLeft && instance.data.videoLeft[0].srcObject) {
            var tracks = instance.data.videoLeft[0].srcObject.getTracks();
            for (var tr in tracks) if (tracks[tr]) tracks[tr].stop();
            if (instance.data.socketConnection.peer) instance.data.socketConnection.peer.removeStream(instance.data.videoLeft[0].srcObject);
            instance.data.videoLeft[0].srcObject = null;
        } else if (instance.data.myStream) {
            var tracks = instance.data.myStream.getTracks();
            for (var tr in tracks) if (tracks[tr]) tracks[tr].stop();
            if (instance.data.socketConnection.peer) instance.data.socketConnection.peer.removeStream(instance.data.myStream);
        }
        instance.data.myStream = null;
        if(instance.data.socketConnection.peer) {
            instance.data.socketConnection.peer.close();
            instance.data.socketConnection.peer = null;
        }
        if(instance.data.socketConnection.socket) {
            instance.data.socketConnection.socket.disconnect();
            instance.data.socketConnection.socket = null;
        }
        if(instance.data.wowzaConnection.ws) {
            instance.data.wowzaConnection.ws.close();
            instance.data.wowzaConnection.ws = null;
        }
        if(instance.data.wowzaConnection.peer) {
            instance.data.wowzaConnection.peer.close();
            instance.data.wowzaConnection.peer = null;
        }
        if(instance.data.wowzaConnectionPlay.ws) {
            instance.data.wowzaConnectionPlay.ws.close();
            instance.data.wowzaConnectionPlay.ws = null;
        }
        if(instance.data.wowzaConnectionPlay.peer) {
            instance.data.wowzaConnectionPlay.peer.close();
            instance.data.wowzaConnectionPlay.peer = null;
        }
    }

    function stopBoth() {
        if (instance.data.socketConnection.socket) {
            instance.data.socketConnection.emit(instance.data.socketConnection.socket, "stop",
                instance.data.controller.fromId);
        }
        instance.data.controller.stop();
    }

    function init(fromId, toId) {
        instance.data.controller.stop();

        instance.data.controller.fromId = fromId;
        instance.data.controller.toId = toId;

        instance.data.webrtcCore.initiateMediaStream(function (stream) {
            if (instance.data.videoLeft) {
                instance.data.videoLeft[0].srcObject = stream;
                instance.data.videoLeft[0].muted = true;
            }
            instance.data.myStream = stream;

            var token = '' + instance.data.controller.fromId + '_' + Date.now();

            instance.data.wowzaConnection.connect('wss://'+context.keys.wowza_host+'/webrtc-session.json',
                'live',
                token,
                function (sdp) {
                    instance.data.webrtcCore.proceedRemoteSDP(instance.data.wowzaConnection.peer, sdp);
                }, function (candidate) {
                    instance.data.webrtcCore.proceedCandidate(instance.data.wowzaConnection.peer, candidate)
                }, function () {
                    instance.data.wowzaConnection.peer = instance.data.webrtcCore.establishPeerConnection(
                        instance.data.wowzaConnection.sendDescription,
                        function (remoteStream) {
                            console.log('remoteStreamWowza', remoteStream);
                        },
                        false
                    );
                    instance.data.webrtcCore.publishMyStream(instance.data.wowzaConnection.peer, stream);
                    instance.publishState("recordName", token+'_aac.mp4');
                    instance.data.token = token;
                    instance.triggerEvent("newRecord");
                    if (instance.data.socketConnection.socket.readyState === instance.data.socketConnection.socket.OPEN) {
                        instance.data.socketConnection.emit(
                            instance.data.socketConnection.socket, "token",
                            instance.data.token,
                            instance.data.controller.fromId);
                    }
                }
            );
        }, instance.data.constraints);

        instance.data.socketConnection.socket = instance.data.socketConnection.connect(context.keys.api_host, fromId, {
            "error": function (err) {
                console.log('error', err);
            },
            "connected": function () {
                console.log('connected');
                if (instance.data.token) {
                    instance.data.socketConnection.emit(
                        instance.data.socketConnection.socket, "token",
                        instance.data.token,
                        instance.data.controller.fromId);
                }
            },
            "disconnected": function (clean, code, reason) {
                console.log('disconnected', clean, code, reason);
                if (!clean) instance.triggerEvent('noConnection');
            },
            "msg:online": function(user, uniqid) {
                console.log('online');
                if (user == toId) {
                    instance.data.controller.p2p();
                    instance.data.socketConnection.emit(
                        instance.data.socketConnection.socket, "token",
                        instance.data.token,
                        instance.data.controller.fromId);
                }
            },
            "msg:offline": function(user, uniqid) {
                console.log('offline', user);
                if (user == toId && instance.data.socketConnection.peer) {
                    instance.data.socketConnection.peer.close();
                    instance.data.socketConnection.peer = null;
                    instance.data.videoRight[0].srcObject = null;
                }
            },
            "msg:notify:sdp": function (sdp, uid) {
                if (uid == toId) {
                    console.log('RECV', 'sdp', 'peer:', instance.data.socketConnection.peer ? instance.data.socketConnection.peer.signalingState : 'new', 'type', sdp.type);
                    if (!instance.data.socketConnection.peer) {
                        instance.data.controller.p2p();
                        instance.data.socketConnection.peer.cachedRemoteDescription = sdp;
                    } else {
                        instance.data.webrtcCore.proceedRemoteSDP(instance.data.socketConnection.peer, sdp);
                    }
                }
            },
            "msg:notify:token": function (token, uid) {
                if (uid == toId) {
                    console.log('RECV', 'token', token);
                    instance.data.recv_token = token;
                    wowza_play(token);
                }
            },
            "msg:notify:stop": function (uid) {
                if (uid == toId) {
                    console.log('RECV', 'stop');
                    instance.data.controller.stop();
                }
            }
        });
    }

    function wowza_play(token) {
        if (instance.data.wowzaConnectionPlay.ws) {
            instance.data.wowzaConnectionPlay.ws.close(1000);
            instance.data.wowzaConnectionPlay.ws = null;
        }
        instance.data.wowzaConnectionPlay.connect('wss://'+context.keys.wowza_host+'/webrtc-session.json',
            'live',
            token,
            function (sdp) {
                instance.data.webrtcCore.proceedRemoteSDP(instance.data.wowzaConnectionPlay.peer, sdp);
            }, function (candidate) {
                instance.data.webrtcCore.proceedCandidate(instance.data.wowzaConnectionPlay.peer, candidate)
            }, function () {
                instance.data.wowzaConnectionPlay.peer = instance.data.webrtcCore.establishPeerConnection(
                    instance.data.wowzaConnectionPlay.sendDescription,
                    function (remoteStream) {
                        if (instance.data.videoRight) {
                            instance.data.videoRight[0].srcObject = remoteStream;
                            instance.data.videoRight[0].muted = false;
                        }
                    },
                    false
                );
                instance.data.wowzaConnectionPlay.play();
            }
        );
    }

    function p2p() {
        if (!context.keys.use_wowza_play && !instance.data.socketConnection.peer) {
            instance.data.socketConnection.peer = instance.data.webrtcCore.establishPeerConnection(
                function (sdp) {
                    instance.data.socketConnection.emit(
                        instance.data.socketConnection.socket, "sdp",
                        sdp,
                        instance.data.controller.fromId);
                },
                function (remoteStream) {
                    instance.data.videoRight[0].srcObject = remoteStream;
                },
                true
            );
        }
        if (!context.keys.use_wowza_play) cameraOn();
    }

    function cameraOn() {
        if (instance.data.myStream) {
            instance.data.controller.sender = instance.data.webrtcCore.publishMyStream(instance.data.socketConnection.peer, instance.data.myStream);
        } else {
            setTimeout(cameraOn, 1000);
        }
    }

    instance.data.webrtcCore = {
        initiateMediaStream: initiateMediaStream,
        establishPeerConnection: establishPeerConnection,
        publishMyStream: publishMyStream,
        proceedRemoteSDP: proceedRemoteSDP,
        proceedCandidate: proceedCandidate
    };

    instance.data.socketConnection = {
        socket: null,
        peer: null,

        connect: connect,
        emit: emit
    };

    instance.data.wowzaConnection = {
        connection: null,
        peer: null,

        connect: connectWowza,
        sendCandidate: sendCandidate,
        sendDescription: sendDescription
    };

    instance.data.wowzaConnectionPlay = {
        connection: null,
        peer: null,

        connect: connectWowzaPlay,
        sendCandidate: sendCandidatePlay,
        sendDescription: sendDescriptionPlay,
        play: play
    };

    instance.data.controller = {
        fromId: null,
        toId: null,
        sender: null,

        init: init,
        p2p: p2p,
        stop: stop,
        stopBoth: stopBoth
    };

    instance.data.constraints = {
        audio: true,
        video: {
            optional: [
                {
                    minWidth: 320
                }
            ]
        }
    };
    instance.data.audioBitrate = 128;
    instance.data.videoBitrate = 300;
    instance.data.videoFrameRate = 29.97;
    instance.data.myStream = null;

}