// index.js
// WARNING:
// THIS IS OLD AND MESSY. IT ALSO WILL NOT WORK.
const fs = require('fs')
const fire = require("firebase-admin")
fire.initializeApp({
    credential: fire.credential.cert(require("key.json")),
    databaseURL: 'https://hubbit-mazer.firebaseio.com'
});
const db = fire.firestore()
const avatars = db.collection("avatars")
const app = require('express')();
const WebSocket = require('ws')
const http = require('http').createServer(app);
const options = {
    key: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/privkey.pem"),
    cert: fs.readFileSync('/etc/letsencrypt/live/server.mazopolis.com/cert.pem'),
    ca: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/chain.pem")
};
const https = require('https').createServer(options, app)
app.get('/*', function(req, res) {
    if(req.secure) {
        res.send('<h1>hey. this is a server :)</h1><hr><i>have a good life and i hope that u like mazopolis and if u do then good but if not idc so bye</i>');
    } else {
        res.redirect('https://server.mazopolis.com')
    }
});
http.listen(80, function() {
    console.log('listening on port 80 (for HTTP requests),ws requests dont meet with HTTP.');
});
https.listen(443, function() {
    console.log('listening on port 443 (for HTTPS requests),ws requests meet at 8080')
})

let connections = []

function getAllPlayers(gameId) {
    return connections
}
let allplayers = []
const wss = new WebSocket.Server({
    server: https
})

function getPlayerByUid(uid) {
    allplayers.forEach(plr => {
        if (plr.uid == uid) {
            return plr
        }
    })
    return null;
}

function getOpenConnections() {
    var r = []
    connections.forEach(el => {
        if(el.readyState == WebSocket.OPEN) {
            r.push(el)
        }
    })
    return r
}
wss.on('connection', function(ws) {
    ws.on("close", () => {
        console.log(ws.uid + " has left.")
        cmdPrompt()
        getAllPlayers().forEach(plr => {
            if(ws.uid && plr.readyState == WebSocket.OPEN) {
                plr.send(JSON.stringify({
                    event: "disconnect",
                    who: ws.uid
                }))
            }
        })
    })
    var waitingForToken = true
    console.log('CONNECTION RECIEVED... WAITING FOR TOKEN...');
    ws.on("message", function(msg) {
        var msgObj = JSON.parse(msg)
        if(waitingForToken == true && msgObj.token) {
            if(msgObj.event == "subscribe") {
                // user is subscribing and waiting for parties
                // TODO: FINISH
            } else {
                console.log("prepping to send player data to all clients...")
                fire.auth().verifyIdToken(msgObj.token).then(user => {
                    fire.auth().getUser(user.uid).then(userData => {
                        console.log(user.uid + " has joined as " + userData.displayName)
                        cmdPrompt()
                        msgObj.uid = user.uid
                        ws.send(JSON.stringify({
                            event: 'success'
                        }))
                        ws.uid = msgObj.uid
                        avatars.doc(msgObj.uid).get().then(doc => {
                            if(doc.exists) {
                                allplayers.push({
                                    uid: msgObj.uid,
                                    face: doc.data().face,
                                    pid: msgObj.pid,
                                })
                                connections.push(ws)
                            } else {
                                allplayers.push({
                                    uid: msgObj.uid,
                                    face: "smile",
                                    pid: msgObj.pid,
                                })
                                connections.push(ws)
                            }

                            var players = getAllPlayers(1)
                            for(var i = 0; i < allplayers.length; i++) {
                                var plr = allplayers[i]
                                var plrConnection = players[i]
                                for (var i = 0; i < players.length; i++) {
                                    var el = players[i]
                                    var plr2 = allplayers[i]
                                    console.log(plr2.pid, plr.pid)
                                    if(el.readyState == WebSocket.OPEN && plrConnection.readyState == WebSocket.OPEN, plr2.pid == plr.pid) {
                                        el.send(JSON.stringify({
                                            event: "join",
                                            who: plr.uid,
                                            plrface: plr.face,
                                            plrsize: 20,
                                            nickname: userData.displayName
                                        }))
                                    }
                                }

                            }

                        })
                    })
                })

                // end of joining madness
            }
            waitingForToken = false
        } else {
            if(msgObj.position && waitingForToken == false) {
                var players = allplayers
                for(var i = 0;i < players.length;i++) {
                    var plr = players[i]
                    var connection = connections[i]
                    if(connection.readyState == WebSocket.OPEN) {
                        if(plr.pid == msgObj.pid) {
                            connection.send(JSON.stringify({
                                event: "move",
                                who: msgObj.uid,
                                pos: msgObj.position
                            }))
                        }else{
                            console.log(plr.pid,msgObj.pid)
                        }
                    }else{
                        console.log("offline user")
                    }
                }
                // end of for loop
            }
        }
    })
});

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
})

function kickall(name) {
    var params = name.replace("kickall ", "")
    console.log("[KICKALL] Starting world wide kick...")
    console.log("[KICKALL] Set reason to", params)
    for(var i = 0; i < connections.length; i++) {
        var el = connections[i]
        var cn = i + 1
        var mcn = getOpenConnections().length + 1
        if(el.readyState == WebSocket.OPEN) {
            el.send(JSON.stringify({
                event: "kick",
                reason: params
            }))
            console.log("[KICKALL]  Gentely kicking user... [" + cn + "]")
            setTimeout(() => {
                if(el.readyState == WebSocket.OPEN) {
                    console.log("[KICKALL] Forcefully closing connection..." + i)
                    el.close()
                    console.log("[KICKALL] Successfully closed connection " + i.toString())
                } else {
                    console.log("[KICKALL] Connection was already closed.")
                }

            }, 5000)
        }
    }
    setTimeout(() => {
        console.log("[KICKALL] Successfully completed ww-kick")
        cmdPrompt()
    }, 5100)
}

function cmdPrompt() {
    readline.question("[CMD] >> ", (name) => {
        console.log("[!] Starting execution of command...")
        if(name.includes("rat")) {
            connections.forEach(el => {
                if(el.readyState == WebSocket.OPEN) {
                    el.send(JSON.stringify({
                        event: "rat"
                    }))
                }
            })
        } else if(name.includes("kickall")) {
            kickall(name)
        } else if(name.includes("shutdown")) {
            console.log("[!!] Shutting Down! Please wait as we kick all active users.")
            kickall(name)
            setTimeout(() => {
                process.exit(1)
            }, 10000);
        } else {
            console.log("[!] ERROR! Command not found.")
        }
        cmdPrompt()
    })
}
setTimeout(function() {
    cmdPrompt()
}, 1000)