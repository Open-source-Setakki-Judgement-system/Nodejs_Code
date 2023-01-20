const dbsettings = require('./var.js');
const express = require('express')
const cors = require('cors')
var mysql = require('mysql');
const fcm = require('firebase-admin')
const fs = require('fs');
const app = express()
app.use(cors())
const options = {
    key: fs.readFileSync('./privkey.pem'),
    cert: fs.readFileSync('./cert.pem')
  };
const https = require('https').createServer(options, app);
const http = require('http').createServer(app)
const io = require('socket.io')(https)
const application = io.of('/application');
const gateway = io.of('/gateway');
let serAccount = require('./firebase_token.json')
const http_port = 80
const https_port = 443



fcm.initializeApp({
    credential: fcm.credential.cert(serAccount),
})

var connection = mysql.createConnection({
    host: dbsettings.host,
    user: dbsettings.user,
    password: dbsettings.pw,
    database: dbsettings.db
});


http.listen(http_port, () => {
    console.log(`Listening to port ${http_port}`)
})

https.listen(https_port, () => {
    console.log(`Listening to port ${https_port}`)
})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

// app.get('/hi', (req, res) => {
//     connection.query(`SELECT Token FROM PushAlert;`, function (error, results, fields) {
//         let target_tokens = new Array();
//         if (error) {
//             console.log(error);
//         }
//         console.log(results);
//         console.log(results.length);
//         for (var i = 0; i < results.length; i++) {
//             console.log(results[i].Token);
//             target_tokens[i]=results[i].Token;
//             console.log(target_tokens[i]);
//         }
//         console.log(target_tokens);
//         let message = {
//             notification: {
//                 title: '일해라',
//                 body: 'Multicast테스트',
//             },
//             tokens: target_tokens,
//             android: {
//                 priority: "high"
//             },
//             apns: {
//                 payload: {
//                     aps: {
//                         contentAvailable: true,
//                     }
//                 }
//             }
//         }
//         fcm.messaging().sendMulticast(message)
//         .then((response) => {
//             if (response.failureCount > 0) {
//                 const failedTokens = [];
//                 response.responses.forEach((resp, idx) => {
//                     if (!resp.success) {
//                         failedTokens.push(target_tokens[idx]);
//                     }
//                 });
//                 console.log('List of tokens that caused failures: ' + failedTokens);
//             }
//             console.log('success')
//             return res.status(200).json({success: true})
//         });
//     });
// })

application.on('connection', socket => {
    console.log('connected', socket.id)

    connection.query(`SELECT * FROM deviceStatus;`, function (error, results, fields) {
        if (error) {
            console.log(error);
        }
        console.log(results);
        for (var i = 0; i < results.length; i++) {
            application.emit('update', result[i])
        }
    });

    socket.on('test', test => {
        console.log('application')
        console.log(test)
        application.emit('msg', 'Halo')
        application.emit('msg', test)
    })

    socket.on('request_push', push_data => {
        console.log(push_data)
        const pushJSON = JSON.stringify(push_data)
        const parsedpush = JSON.parse(pushJSON)
        console.log(parsedpush.token)
        console.log(parsedpush.device_id)
        console.log(parsedpush.expect_state)
        connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status) VALUES ('${parsedpush.token}',${parsedpush.device_id},${parsedpush.expect_state});`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        //io.emit('msg', 'Halo')
    })
})

io.on('connection', socket => {
    console.log('connected', socket.id)

    socket.on('update_state', state_data => {
        console.log(state_data)
        const stateJSON = JSON.stringify(state_data)
        const parsedstate = JSON.parse(stateJSON)
        console.log(parsedstate.id)
        console.log(parsedstate.state)
        console.log(parsedstate.alive)
        connection.query(`UPDATE deviceStatus SET state = ${parsedstate.state}, alive = ${parsedstate.alive} WHERE id =${parsedstate.id};`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        application.emit('update', state_data)

        connection.query(`SELECT Token FROM PushAlert WHERE device_id = ${parsedstate.id} AND Expect_Status = ${parsedstate.state};`, function (error, results, fields) {
            let target_tokens = new Array();
            if (error) {
                console.log(error);
            }
            console.log(results);
            console.log(results.length);
            for (var i = 0; i < results.length; i++) {
                console.log(results[i].Token);
                target_tokens[i]=results[i].Token;
                console.log(target_tokens[i]);
            }
            console.log(target_tokens);
            if(target_tokens == 0){
                return
            }
            let message = {
                notification: {
                    title: '세탁기/건조기 알림',
                    body: `${parsedstate.id}번 세탁기/건조기의 동작이 완료되었습니다.`,
                },
                tokens: target_tokens,
                android: {
                    priority: "high"
                },
                apns: {
                    payload: {
                        aps: {
                            contentAvailable: true,
                        }
                    }
                }
            }
            fcm.messaging().sendMulticast(message)
            .then((response) => {
                if (response.failureCount > 0) {
                    const failedTokens = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            failedTokens.push(target_tokens[idx]);
                        }
                    });
                    console.log('List of tokens that caused failures: ' + failedTokens);
                }
                console.log('success')
                return res.status(200).json({success: true})
            });
        });

        connection.query(`DELETE FROM PushAlert WHERE device_id = ${parsedstate.id} AND Expect_Status = ${parsedstate.state};`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });

        //io.emit('msg', 'Halo')
    })

    socket.on('test', test => {
        console.log('gateway')
        console.log(test)
        io.emit('msg', 'Halo')
        io.emit('msg', test)
    })

})