// Импортируем библиотеку для работы с Telegram Bot API
const TelegramBot = require('node-telegram-bot-api');

// Указываем токен бота (его нужно получить через BotFather)
const token = '8087924083:AAEPsBIU4QEuW1hv2mQkc-b8EP7H8Qe0FL0';
const bot = new TelegramBot(token, { polling: true });

// Храним параметры, которые мы будем запрашивать
let priceDifference, trackingPeriod, repeatFrequency;
let isSessionActive = false;

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  if (isSessionActive) {
    bot.sendMessage(chatId, "Сессия уже активна. Пожалуйста, завершите текущую настройку перед началом новой.");
    return;
  }
  
  isSessionActive = true;
  bot.sendMessage(chatId, "Привет! Я помогу настроить параметры. Сначала, какую разницу в цене ты хочешь установить?");
  
  // Переходим к следующему шагу после получения разницы в цене
  bot.once('message', (msg) => {
    priceDifference = msg.text;
    bot.sendMessage(chatId, "Отлично! Теперь, какой период отлеживания ты хочешь установить?");
    
    // Переходим к следующему шагу после получения периода отлеживания
    bot.once('message', (msg) => {
      trackingPeriod = msg.text;
      bot.sendMessage(chatId, "Прекрасно! Теперь, какую частоту повторений ты хочешь установить?");
      
      // Переходим к последнему шагу после получения частоты повторений
      bot.once('message', (msg) => {
        repeatFrequency = msg.text;
        bot.sendMessage(chatId, "Настройка завершена! Вот твои параметры:");
        
        // Выводим параметры в консоль
        console.log(`Разница в цене: ${priceDifference}`);
        console.log(`Период отлеживания: ${trackingPeriod}`);
        console.log(`Частота повторений: ${repeatFrequency}`);
        
        bot.sendMessage(chatId, `Разница в цене: ${priceDifference}\nПериод отлеживания: ${trackingPeriod}\nЧастота повторений: ${repeatFrequency}`);
        
        // Завершаем сессию
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
  
  // Завершаем текущую сессию
  isSessionActive = false;
});
