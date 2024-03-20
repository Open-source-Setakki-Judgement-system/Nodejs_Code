const credential = require('./var.js');;
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name: '앱버전',
    description: '안드로이드/IOS 앱의 최신 버전을 변경합니다.(업데이트 알림)',
    options: [
      {
        name: 'first-number',
        description: '안드로이드/IOS',
        type: ApplicationCommandOptionType.Number,
        choices: [
          {
            name: 'Andriod',
            value: 0
          },
          {
            name: 'IOS',
            value: 1
          }
        ],
        required: true
      },
      {
        name: 'input',
        description: '앱 버전',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },
  {
    name: '스토어',
    description: '안드로이드/IOS 앱의 스토어 등록 여부를 변경합니다.(업데이트 알림)',
    options: [
      {
        name: 'first-number',
        description: '안드로이드/IOS',
        type: ApplicationCommandOptionType.Number,
        choices: [
          {
            name: 'Andriod',
            value: 0
          },
          {
            name: 'IOS',
            value: 1
          }
        ],
        required: true
      },
      {
        name: 'second-number',
        description: '등록여부',
        type: ApplicationCommandOptionType.Number,
        choices: [
          {
            name: '미등록',
            value: 0
          },
          {
            name: '등록',
            value: 1
          }
        ],
        required: true
      }
    ]
  },
  {
    name: '상태변경',
    description: '장치의 상태를 변경합니다.',
    options: [
      {
        name: 'first-number',
        description: '세탁기/건조기의 번호',
        type: ApplicationCommandOptionType.Number,
        required: true
      },
      {
        name: 'second-number',
        description: '변경할 세탁기/건조기의 상태',
        type: ApplicationCommandOptionType.Number,
        choices: [
          {
            name: '작동중',
            value: 0
          },
          {
            name: '사용가능',
            value: 1
          },
          {
            name: '연결 끊어짐',
            value: 2
          }
        ],
        required: true
      }
    ]
  },
  {
    name: '연결목록',
    description: '연결된 임베디드 장치의 목록을 확인합니다.',
  },
  {
    name: '상태확인',
    description: '장치의 현재 상태를 확인합니다.',
    options: [
      {
        name: 'first-number',
        description: '장치의 고유번호 (HWID)',
        type: ApplicationCommandOptionType.Number,
        required: true
      }
    ]
  },
  {
    name: '수동푸시',
    description: '해당 디바이스 토큰으로 푸시 알림을 보냅니다.',
    options: [
      {
        name: 'input',
        description: 'JSON 형태로 데이터를 입력받습니다. Key: Token, Title, Body',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  },
  {
    name: '재시작',
    description: 'USE THIS AT YOUR OWN RISK.',
  }
];

const rest = new REST({ version: '10' }).setToken(credential.discord_token);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        credential.discord_clientid,
        credential.discord_guildid
      ),
      { body: commands }
    );

    console.log('Slash commands were registered successfully!');
  } catch (error) {
    console.log(`There was an error: ${error}`);
  }
})();