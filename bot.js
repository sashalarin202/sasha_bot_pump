// Импортируем библиотеки
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// Указываем токен бота (его нужно получить через BotFather)
const token = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const bot = new TelegramBot(token, { polling: true });

// Глобальные переменные для параметров
let priceDifference, trackingPeriod, repeatFrequency;
let isSessionActive = false;
let socket = null;
const trackedTokens = new Map();
const AUTH_CODE = '123456';
const authorizedUsers = new Set();

// Функция для получения исторической цены токена
async function getHistoricalPrice(symbol, minutesAgo) {
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol: symbol,
        interval: '1m',
        limit: minutesAgo + 1
      }
    });
    const historicalCandle = response.data[0];
    return parseFloat(historicalCandle[1]); // Цена открытия
  } catch (error) {
    console.error(`Ошибка получения исторической цены для ${symbol}: ${error.message}`);
    return null;
  }
}

// Функция для получения времени следующего оповещения
function getNextNotificationTime() {
  return Date.now() + repeatFrequency * 60000;
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!authorizedUsers.has(chatId)) {
    bot.sendMessage(chatId, "Введите код авторизации:");
    bot.once('message', (msg) => {
      if (msg.text === AUTH_CODE) {
        authorizedUsers.add(chatId);
        bot.sendMessage(chatId, "Код принят! Используйте команду /start снова.");
      } else {
        bot.sendMessage(chatId, "Неверный код. Доступ запрещен.");
      }
    });
    return;
  }

  console.log(`Получена команда /start от чата ${chatId}`);

  if (isSessionActive) {
    bot.sendMessage(chatId, "Сессия уже активна. Используйте /stop для остановки.");
    return;
  }

  isSessionActive = true;
  bot.sendMessage(chatId, "Привет! Установите разницу в цене (в %):");

  bot.once('message', (msg) => {
    priceDifference = parseFloat(msg.text);
    bot.sendMessage(chatId, "Установите период отслеживания (в минутах):");

    bot.once('message', (msg) => {
      trackingPeriod = parseFloat(msg.text);
      bot.sendMessage(chatId, "Установите частоту повторений оповещений (в минутах):");

      bot.once('message', async (msg) => {
        repeatFrequency = parseFloat(msg.text);
        bot.sendMessage(chatId, "Настройка завершена! Ожидание обновлений...");

        socket = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

        socket.on('open', () => {
          bot.sendMessage(chatId, "Соединение с Binance установлено!");
          console.log("Соединение с Binance установлено.");
        });

        socket.on('message', async (data) => {
          try {
            const ticker = JSON.parse(data);
            if (ticker.s && ticker.s.endsWith('USDT')) {
              const token = ticker.s;
              const currentPrice = parseFloat(ticker.c);

              if (!trackedTokens.has(token)) {
                const initialPrice = await getHistoricalPrice(token, trackingPeriod);
                if (initialPrice !== null) {
                  trackedTokens.set(token, {
                    initialPrice: initialPrice,
                    nextNotificationTime: 0,
                  });
                }
              }

              const tokenData = trackedTokens.get(token);
              if (tokenData) {
                const priceChange = ((currentPrice - tokenData.initialPrice) / tokenData.initialPrice) * 100;

                if (priceChange >= priceDifference && Date.now() >= tokenData.nextNotificationTime) {
                  bot.sendMessage(chatId, `Токен ${token} вырос на ${priceChange.toFixed(2)}%!`);
                  trackedTokens.set(token, {
                    initialPrice: currentPrice, 
                    nextNotificationTime: getNextNotificationTime(),
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Ошибка обработки данных: ${error.message}`);
          }
        });

        socket.on('error', (error) => {
          bot.sendMessage(chatId, `Ошибка WebSocket: ${error.message}`);
          console.error(`Ошибка WebSocket: ${error.message}`);
        });
      });
    });
  });
});

// Обработчик команды /stop
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (!isSessionActive || !socket) {
    bot.sendMessage(chatId, "Сессия уже остановлена или не запущена.");
    return;
  }

  socket.close();
  socket = null;
  isSessionActive = false;
  bot.sendMessage(chatId, "Сессия остановлена. Используйте /start для новой настройки.");
  console.log("Сессия остановлена пользователем.");
});
