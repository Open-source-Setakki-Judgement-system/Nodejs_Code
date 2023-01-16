const dbsettings = require('./var.js');
const express = require('express')
const cors = require('cors')
var mysql = require('mysql');
const fcm = require('firebase-admin')
const app = express()
app.use(cors())
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const application = io.of('/application');
const gateway = io.of('/gateway');
let serAccount = require('./firebase_token.json')
const port = 1900

fcm.initializeApp({
    credential: fcm.credential.cert(serAccount),
})

var connection = mysql.createConnection({
    host: dbsettings.host,
    user: dbsettings.user,
    password: dbsettings.pw,
    database: dbsettings.db
});

connection.connect();

http.listen(port, () => {
    console.log(`Listening to port ${port}`)
})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

app.get('/hi', (req, res) => {
    var target_tokens = new Array();
    connection.query(`SELECT Token FROM PushAlert;`, function (error, results, fields) {
        if (error) {
            console.log(error);
        }
        console.log(results);
        console.log(results.length);
        for (var i = 0; i < results.length; i++) {
            console.log(results[i].Token);
            target_tokens[i]=results[i].Token;
        }
    });
    console.log(target_tokens);
    // let target_token = ["c_cffKHoRcGhXqYB7uNiXZ:APA91bFqiO_e_Or_6HR9iZeU6grfidkU25YDA2mcty1chchsW_42u3MRMiRGH6YEoYt4iulhYJM3xvrmiZPEdOZbHDxyofdq8hRnBut3ztsVYSqHwcdPzr-5i2ePgAVw9Gafs_G7sn59",]
    // //target_token은 푸시 메시지를 받을 디바이스의 토큰값입니다

    let message = {
        notification: {
            title: '일해라',
            body: 'Multicast테스트',
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

    // fcm
    //     .messaging()
    //     .send(message)
    //     .then(function (response) {
    //         console.log('Successfully sent message: : ', response)
    //     })
    //     .catch(function (err) {
    //         console.log('Error Sending message!!! : ', err)
    //     })
    fcm.messaging().sendMulticast(message)
        .then((response) => {
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(deviceToken[idx]);
                    }
                });
                console.log('List of tokens that caused failures: ' + failedTokens);
            }
            console.log('success')
            return res.status(200).json({success: true})
        });
})

application.on('connection', socket => {
    console.log('connected', socket.id)

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
        connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status) VALUES (${parsedpush.token},${parsedpush.device_id},${parsedpush.expect_state})`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        //io.emit('msg', 'Halo')
    })
})

gateway.on('connection', socket => {
    console.log('connected', socket.id)


    socket.on('update_state', state_data => {
        console.log(state_data)
        const stateJSON = JSON.stringify(state_data)
        const parsedstate = JSON.parse(stateJSON)
        console.log(parsedstate.id)
        console.log(parsedstate.state)
        connection.query(`UPDATE deviceStatus SET state = ${parsedstate.state} WHERE id =${parsedstate.id};`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        application.emit('update', state_data)
        connection.query(`SELECT Token FROM PushAlert WHERE device_id = ${parsedstate.id} AND Expect_Status = ${parsedstate.state};`, function (error, results, fields) {
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
        gateway.emit('msg', 'Halo')
        gateway.emit('msg', test)
    })

})