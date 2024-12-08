// Импортируем библиотеки
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');

// Указываем токен бота (его нужно получить через BotFather)
const token = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const bot = new TelegramBot(token, { polling: true });

// Глобальные переменные для параметров
let priceDifference, trackingPeriod, repeatFrequency;
let isSessionActive = false;
let usdtPairCount = 0;  // Счетчик пар USDT

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (isSessionActive) {
    bot.sendMessage(chatId, "Сессия уже активна. Пожалуйста, завершите текущую настройку перед началом новой.");
    return;
  }

  isSessionActive = true;
  bot.sendMessage(chatId, "Привет! Я помогу настроить параметры. Сначала, какую разницу в цене ты хочешь установить?");

  // Шаг 1: Получаем разницу в цене
  bot.once('message', (msg) => {
    priceDifference = msg.text;
    bot.sendMessage(chatId, "Отлично! Теперь, какой период отслеживания ты хочешь установить?");

    // Шаг 2: Получаем период отслеживания
    bot.once('message', (msg) => {
      trackingPeriod = msg.text;
      bot.sendMessage(chatId, "Прекрасно! Теперь, какую частоту повторений ты хочешь установить?");

      // Шаг 3: Получаем частоту повторений
      bot.once('message', (msg) => {
        repeatFrequency = msg.text;
        bot.sendMessage(chatId, "Настройка завершена! Вот твои параметры:");

        // Отправляем параметры пользователю
        bot.sendMessage(chatId,
          `Разница в цене: ${priceDifference}\n` +
          `Период отслеживания: ${trackingPeriod}\n` +
          `Частота повторений: ${repeatFrequency}`
        );

        // Подключаемся к Binance WebSocket
        const socket = new WebSocket('wss://stream.binance.com:9443/ws/!ticker');

        socket.on('open', () => {
          bot.sendMessage(chatId, "Соединение с Binance установлено!");
          console.log('Соединение с Binance установлено');
        });

        // Обработка данных от Binance
        socket.on('message', (data) => {
          try {
            const ticker = JSON.parse(data);

            // Увеличиваем счетчик, если пара заканчивается на USDT
            if (ticker.s && ticker.s.endsWith('USDT')) {
              usdtPairCount++;
            }
          } catch (error) {
            console.error(`Ошибка обработки данных: ${error.message}`);
          }
        });

        // Отправляем количество пар каждую минуту
        const sendInterval = setInterval(() => {
          if (usdtPairCount > 0) {
            bot.sendMessage(chatId, `Количество пар с USDT: ${usdtPairCount}`);
            console.log(`Количество пар с USDT: ${usdtPairCount}`);
            usdtPairCount = 0;  // Сбрасываем счетчик
          }
        }, 60000); // Отправляем каждые 60 секунд

        // Закрытие соединения
        socket.on('close', () => {
          clearInterval(sendInterval);  // Останавливаем отправку
          bot.sendMessage(chatId, "Соединение с Binance закрыто.");
          console.log('Соединение закрыто');
        });

        socket.on('error', (error) => {
          bot.sendMessage(chatId, `Ошибка WebSocket: ${error.message}`);
          console.error(`Ошибка WebSocket: ${error.message}`);
        });

        // Завершаем настройку
        isSessionActive = false;
      });
    });
  });
});

// Обработчик команды /stop
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;

  if (!isSessionActive) {
    bot.sendMessage(chatId, "Сессия не активна. Бот уже остановлен.");
    return;
  }

  bot.sendMessage(chatId, "Сессия завершена. Ты можешь начать новую настройку с командой /start.");
  isSessionActive = false;
});
