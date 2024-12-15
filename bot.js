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
const trackedTokens = new Map();

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
  console.log(`Получена команда /start от чата ${chatId}`);

  if (isSessionActive) {
    bot.sendMessage(chatId, "Сессия уже активна. Завершите текущую настройку перед началом новой.");
    console.log("Попытка повторного запуска при активной сессии.");
    return;
  }

  isSessionActive = true;
  bot.sendMessage(chatId, "Привет! Установите разницу в цене (в %):");

  bot.once('message', (msg) => {
    priceDifference = parseFloat(msg.text);
    console.log(`Установлена разница в цене: ${priceDifference}%`);
    bot.sendMessage(chatId, "Установите период отслеживания (в минутах):");

    bot.once('message', (msg) => {
      trackingPeriod = parseFloat(msg.text);
      console.log(`Установлен период отслеживания: ${trackingPeriod} минут`);
      bot.sendMessage(chatId, "Установите частоту повторений оповещений (в минутах):");

      bot.once('message', async (msg) => {
        repeatFrequency = parseFloat(msg.text);
        console.log(`Установлена частота повторений: ${repeatFrequency} минут`);
        bot.sendMessage(chatId, "Настройка завершена! Ожидание обновлений...");

        const socket = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

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
              console.log(`Получены данные: ${token} - Текущая цена: ${currentPrice}`);

              if (!trackedTokens.has(token)) {
                const initialPrice = await getHistoricalPrice(token, trackingPeriod);
                if (initialPrice !== null) {
                  trackedTokens.set(token, {
                    initialPrice: initialPrice,
                    nextNotificationTime: 0,
                  });
                  console.log(`Добавлен новый токен ${token} с исторической ценой ${initialPrice}`);
                }
              }

              const tokenData = trackedTokens.get(token);
              if (tokenData) {
                const priceChange = ((currentPrice - tokenData.initialPrice) / tokenData.initialPrice) * 100;

                if (priceChange >= priceDifference && Date.now() >= tokenData.nextNotificationTime) {
                  bot.sendMessage(chatId, `Токен ${token} вырос на ${priceChange.toFixed(2)}%!`);
                  console.log(`Отправлено сообщение: ${token} вырос на ${priceChange.toFixed(2)}%`);
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

        socket.on('close', () => {
          bot.sendMessage(chatId, "Соединение с Binance закрыто.");
          console.log("Соединение с Binance закрыто.");
          isSessionActive = false;
        });

        socket.on('error', (error) => {
          bot.sendMessage(chatId, `Ошибка WebSocket: ${error.message}`);
          console.error(`Ошибка WebSocket: ${error.message}`);
        });
      });
    });
  });
});
