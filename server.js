const dbsettings = require('./var.js');
const express = require('express')
const cors = require('cors')
const mysql = require('mysql');
const fcm = require('firebase-admin')
const fs = require('fs');

const app = express()
app.use(cors())

require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l');

const options = {
    key: fs.readFileSync('./privkey.pem'),
    cert: fs.readFileSync('./cert.pem')
};

const https = require('https').createServer(options, app);
const http = require('http').createServer(app)
const io = require('socket.io')(https)
const application = io.of('/application');

const serAccount = require('./firebase_token.json')

const http_port = 80
const https_port = 443

fcm.initializeApp({
    credential: fcm.credential.cert(serAccount),
})

const connection = mysql.createConnection({
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

//Socket.io-Gateway

io.on('connection', socket => {
    console.log('Socket.IO Connected:', socket.id)

    //Gateway에서 update_state 받으면
    socket.on('update_state', state_data => {
        console.log('Status Updated')
        const { id, state, alive } = state_data;
        console.log('Device ID:')
        console.log(id)
        console.log('Status:')
        console.log(state)
        console.log('Alive: ')
        console.log(alive)

        //Gateway에서 Socket.io로 넘어온 값 DB에 넣기
        connection.query(`UPDATE deviceStatus SET state = ?, alive = ? WHERE id = ?;`, [state, alive, id], (error, results) => {
            if (error) {
                console.log('deviceStatus Update query error:');
                console.log(error);
                return;
            }
            console.log(results);
        });

        //Application과 Frontend에 현재 상태 DB 넘기기
        connection.query(`SELECT * FROM deviceStatus;`, function (error, results) {
            if (error) {
                console.log('SELECT * FROM deviceStatus query error:');
                console.log(error);
                return;
            }
            console.log(results);
            application.emit('update', results)
        });

        //Gateway에서 Socket.io로 넘어온 값에 등록된 Token 조회해서 FCM 보내기
        connection.query(`SELECT Token FROM PushAlert WHERE device_id = ? AND Expect_Status = ?;`, [id, state], function (error, results) {
            let target_tokens = new Array();
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            console.log(results);
            console.log(results.length);

            //해당되는 Token 배열형태로 저장
            for (let i = 0; i < results.length; i++) {
                console.log(results[i].Token);
                target_tokens[i] = results[i].Token;
                console.log(target_tokens[i]);
            }
            console.log(target_tokens);

            //해당되는 Token이 없다면 return
            if (target_tokens == 0) {
                return
            }

            //FCM 메시지 내용
            let message = {
                notification: {
                    title: '세탁기/건조기 알림',
                    body: `${id}번 세탁기/건조기의 동작이 완료되었습니다.`,
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

            //FCM 메시지 보내기
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
                    return
                });
        });

        //FCM 메시지 보낸 Token 제거
        connection.query(`DELETE FROM PushAlert WHERE device_id = ? AND Expect_Status = ?;`, [id, state], function (error, results) {
            if (error) {
                console.log('DELETE Token query error:');
                console.log(error);
                return;
            }
            console.log(results);
        });

    })

})

//Socket.io-Application,Frontend

application.on('connection', socket => {
    console.log('Socket.IO Connected:', socket.id)

    //Application과 Frontend에 현재 상태 DB 넘기기
    connection.query(`SELECT * FROM deviceStatus;`, function (error, results) {
        if (error) {
            console.log('SELECT * FROM deviceStatus query error:');
            console.log(error);
            return;
        }
        console.log(results);
        application.emit('update', results)
        console.log('==============================================')
    });

    //Application에서 request_push 받으면
    socket.on('request_push', push_data => {
        console.log('Push Request Received')
        const { token, device_id, expect_state } = push_data;
        console.log('Device Token:')
        console.log(token)
        console.log('Device ID:')
        console.log(device_id)
        console.log('Expectd Status:')
        console.log(expect_state)

        //DB에 중복되는 값 있는지 확인
        connection.query(`SELECT Token FROM PushAlert WHERE device_id = ? AND Expect_Status = ? AND Token = ?;`, [device_id, expect_state,token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }

            //중복이면 return
            if (results.length > 0) {
                console.log('This is a duplicate value');
                console.log('==============================================')
                return;
            } else {//중복 아니면 DB에 Token 등록
                connection.query(`SELECT device_type FROM deviceStatus WHERE id = ?;`, [device_id], function (error, results) {
                    if (error) {
                        console.log('SELECT device_type query error:');
                        console.log(error);
                        return;
                    }
                    console.log(results);
                });
                connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status) VALUES (?, ?, ?);`, [token, device_id, expect_state], (error, results) => {
                    if (error) {
                        console.log('deviceStatus Update query error:');
                        console.log(error);
                        return;
                    }
                    console.log(results);
                    console.log('Push Request Success')
                    console.log('==============================================')
                });
            }
        });
    })
    //Application에서 푸시 신청 목록 보기 누르면
    socket.on('view_request', view_requset_data => {
        console.log('Push Request List Received')
        const { token } = view_requset_data;
        console.log('Device Token:')
        console.log(token)

        connection.query(`SELECT device_id FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            socket.emit('request_list',results);
            console.log(results);
        });
    })
    //Application에서 푸시 신청 제거하면
    socket.on('remove_request', remove_request_data => {
        console.log('Push Request remove Received')
        const { token,device_id } = remove_request_data;
        console.log('Device Token:')
        console.log(token)
        console.log('Device ID:')
        console.log(device_id)

        connection.query(`DELETE FROM PushAlert WHERE device_id = ? AND Token = ?;`, [device_id,token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            console.log(results);
        });

        connection.query(`SELECT device_id FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            socket.emit('request_list',results);
            console.log(results);
        });
    })
})