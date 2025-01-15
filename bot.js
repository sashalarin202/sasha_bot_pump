// Импортируем библиотеки
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// Указываем токен бота (его нужно получить через BotFather)
const token = '';
//8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0
const bot = new TelegramBot(token, { polling: true });

// Глобальные переменные для параметров
let priceDifference, trackingPeriod, repeatFrequency;
let isSessionActive = false;
let repeatInterval = null;
let activeSocket = null; // Хранение активного WebSocket
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

// Функция подключения к WebSocket
function connectToWebSocket(chatId) {
  if (activeSocket) {
    activeSocket.close();
  }

  activeSocket = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');
  trackedTokens.clear();

  activeSocket.on('open', () => {
    console.log("Соединение с Binance установлено.");
  });

  activeSocket.on('message', async (data) => {
    try {
      const ticker = JSON.parse(data);
      if (ticker.s && ticker.s.endsWith('USDT')) {
        const token = ticker.s;
        const currentPrice = parseFloat(ticker.c);

        if (!trackedTokens.has(token)) {
          const initialPrice = await getHistoricalPrice(token, trackingPeriod);
          if (initialPrice !== null) {
            trackedTokens.set(token, { initialPrice });
          }
        }

        const tokenData = trackedTokens.get(token);
        if (tokenData) {
          const priceChange = ((currentPrice - tokenData.initialPrice) / tokenData.initialPrice) * 100;
          let action = '';
          if (priceChange >= priceDifference) {
            action = '🟢Long';
          } else if (priceChange <= -priceDifference) {
            action = '🔴Short';
          }

          if (action) {
            const message = `Binance\n${action} ${token}\nЦена ${currentPrice.toFixed(6)}\nПроцент изменился на ${priceChange.toFixed(2)}%\n[Перейти на Binance](https://www.binance.com/en/trade/${token})`;
            bot.sendMessage(chatId, message.replace(/[.\-]/g, '\\$&'), { parse_mode: 'MarkdownV2' });
            trackedTokens.set(token, { initialPrice: currentPrice });
          }
        }
      }
    } catch (error) {
      console.error(`Ошибка обработки данных: ${error.message}`);
    }
  });

  activeSocket.on('close', () => {
    console.log("Соединение WebSocket закрыто.");
  });

  activeSocket.on('error', (error) => {
    bot.sendMessage(chatId, `Ошибка WebSocket: ${error.message}`);
    console.error(`Ошибка WebSocket: ${error.message}`);
  });
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

  bot.sendMessage(chatId, "Привет! Установите разницу в цене (в %):");
  bot.once('message', (msg) => {
    priceDifference = parseFloat(msg.text);
    bot.sendMessage(chatId, "Установите период отслеживания (в минутах):");

    bot.once('message', (msg) => {
      trackingPeriod = parseFloat(msg.text);
      bot.sendMessage(chatId, "Установите частоту повторений оповещений (в минутах):");

      bot.once('message', (msg) => {
        repeatFrequency = parseFloat(msg.text);
        bot.sendMessage(chatId, "Настройка завершена! Запускаю отслеживание...");

        // Первое подключение без ожидания
        connectToWebSocket(chatId);

        // Повторное выполнение через интервал
        repeatInterval = setInterval(() => connectToWebSocket(chatId), repeatFrequency * 60000);
        isSessionActive = true;
      });
    });
  });
});

// Обработчик команды /stop
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;

  if (!isSessionActive) {
    bot.sendMessage(chatId, "Сессия уже остановлена или не запущена.");
    return;
  }

  // Останавливаем интервал
  if (repeatInterval) {
    clearInterval(repeatInterval);
    repeatInterval = null;
  }

  // Закрываем WebSocket
  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }

  isSessionActive = false;
  bot.sendMessage(chatId, "Сессия остановлена. Используйте /start для новой настройки.");
  console.log("Сессия остановлена пользователем.");
});
