import { configureLocalization } from './framework/localize.js';
import { MAX_PROMPT_TOKENS } from './utils.js';

// Constants for Telegram Tips links to mode documentation
const SECRETARY_URL = "https://t.me/TelegramTips/567";
const GUEST_URL = "https://t.me/TelegramTips/565";
const BOTFATHER_APP = "[miniapp](https://t.me/botfather?startapp)";
export const REPO_URL = "https://github.com/PublicAffairs/tg-transcribot";


const REPO_LINK = `[tg-transcribot](${REPO_URL})`;
const STT_API_URL = "https://console.groq.com/docs/speech-to-text#using-the-api";
const WHISPER_PROMPTING_GUIDE_URL = "https://developers.openai.com/cookbook/examples/whisper_prompting_guide";
const OPENAI_STT_URL = "https://developers.openai.com/api/docs/guides/speech-to-text";

export const translations = {
  en: {
    // Bot Profile Metadata
    botName: `Transcribot`,
    botDescription: `I transcribe voice messages, audio files, and video notes (circles) to text using the Whisper API`,
    botShortDescription: `Transcribe voice messages and audio files to text`,
    
    noAudio: `⚠️ *No audio or voice message found in the reply.*`,
    help: `Hello! I am a transcription bot. Send or forward a voice message or audio file to me, and I will transcribe it into text.`,
    transcription: `🎤 *Transcription:*`,
    error: `⚠️ *Transcription error:*`,
    fileTooLarge: `⚠️ *File is too large.* The Telegram Bot API restricts downloads to a maximum of {max_mb} MB.`,
    notAudioFile: `⚠️ *Unsupported file format.* Only audio and video files can be transcribed.`,
    unsupportedVideo: `⚠️ *Unsupported video format.* Please send audio or video in MP4/WebM format.`,
    apiKeyMissing: `⚠️ *API Key is not configured!*
Please set the \`WHISPER_API_KEY\` environment variable on your server to enable transcription.`,
    settingsTitle: `🛠️ *Owner Settings:*`,
    welcomeMessage: `🤖 *Welcome to Transcribot!*

You have been successfully registered as the owner. You can reset owner status on the [dashboard]({dashboard_url}).

Commands:
/mode: Toggle active bot modes (_Groups_, [_Secretary_](${SECRETARY_URL}), [_Guest_](${GUEST_URL}))
/help: View all available commands and settings`,
    
    // Command Descriptions & Roles
    cmdHelp: `Show this help`,
    cmdLang: `Set transcription language`,
    cmdLangbot: `Set bot UI language`,
    cmdMode: `Toggle active bot modes (_Groups_, [_Secretary_](${SECRETARY_URL}), [_Guest_](${GUEST_URL}))`,
    cmdModel: `Select [Whisper](${STT_API_URL}) model`,
    cmdNotify: `Configure owner notifications`,
    cmdProcess: `Transcribe (_in reply to media_)`,
    cmdPromptUser: `Use [custom](${WHISPER_PROMPTING_GUIDE_URL}) prompt (_in reply to media_)`,
    cmdPromptAdmin: `Set [custom](${WHISPER_PROMPTING_GUIDE_URL}) Whisper prompt`,
    cmdReadme: `View repository README`,
    cmdConfig: `Manage bot settings and configuration`,
    cmdSettings: `Show current settings status`,
    cmdSetbotinfo: `Set/update bot name and description`,
    cmdVerbose: `Toggle technical data display`,
    cmdWebhook: `View or change the bot's webhook URL`,
    botInfoSuccess: `✅ Bot name, description, and short description have been updated successfully.`,
    
    // Status Feedback Alert Texts
    unauthorized: `❌ Unauthorized: Admin access only.`,
    settingsUpdated: `✅ Settings updated successfully.`,
    webhookUpdateFailed: `❌ Webhook update failed: {error}`,
    btnStateOutOfSync: `⚠️ The button status was out of date. The menu has been refreshed.`,

    // /webhook command
    webhookTitle: `🔗 *Current Webhook URL:*
\`{url}\`

To move the bot to a new URL, send:
\`/webhook https://new-domain.example.com\`

🖥️ *Dashboard:* {dashboard_url}`,
    webhookMenuText: `Current URL: \`{url}\`

To update the bot webhook, send:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Change URL…`,
    botVersion: `🤖 ${REPO_LINK} \`v{val}\``,
    webhookHealthChecking: `🔄 Checking availability of the new URL…`,
    webhookHealthOk: `✅ *Webhook updated successfully!*

*New URL:* \`{url}\`

_The bot has moved to the new server. This instance will no longer receive updates._`,
    webhookHealthFail: `❌ *New URL is not reachable.*

*URL:* \`{url}\`
*Error:* {error}

_Webhook was NOT changed. Please check the URL and try again._`,

    // Configuration Titles
    modeTitle: `⚙️ *Bot Modes:*

Configure active modes.`,
    langbotTitle: `🌐 *Bot UI Language:*

Select language for bot UI and system messages.`,
    langbotSuccess: `🌐 Bot UI language set to: *{val}*`,
    langTitle: `🗣️ *Whisper: transcription language:*

Choose the target language for [Whisper](${STT_API_URL}) voice recognition.

Current: *{val}*

💡 _If your language is not listed in the buttons, you can set it directly by sending:_
\`/lang <language_code>\` (e.g. \`/lang fr\`)`,
    langSuccess: `🗣️ Whisper language set to: *{val}*`,
    modelTitle: `🤖 *Whisper: model:*

Select the [AI model](${OPENAI_STT_URL}) used for transcription.`,
    modelSuccess: `🤖 Whisper model set to: *{val}*`,
    notifyTitle: `🔔 *Owner Notifications:*

Configure what alerts the owner receives.`,
    notifyFooterHidden: `💡 _Some notification types are hidden because the corresponding modes are not active. See /mode._`,
    verboseTitle: `📝 *Show Technical Data:*

Toggles whether technical data (file format, size, duration) is appended to transcription replies.`,
    verboseSuccess: `📝 Show technical data is now: *{val}*`,
    promptTitle: `✍️ *Whisper: Prompt:*

To configure a custom prompt, send the /prompt command followed by your text.

Current prompt: _{val}_`,
    promptDefault: `Default template`,
    promptEmpty: `Empty (no prompt)`,
    promptCustomLabel: `custom`,
    promptSuccess: `✍️ Custom Whisper prompt updated to:
_"{val}"_{warning}`,
    promptTruncated: `

⚠️ _Note: Your prompt exceeded the ~${MAX_PROMPT_TOKENS} token limit and was truncated._`,

    // Mode capability warnings
    modeFooter: `💡 _Some modes may require additional permissions — configure them via @BotFather or ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *_Groups_ Mode is not enabled for this bot.*

Enable it via @BotFather or ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *[_Secretary_](${SECRETARY_URL}) Mode is not enabled for this bot.*

Enable it via @BotFather or ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Guest_](${GUEST_URL}) Mode is not enabled for this bot.*

Enable it via _BotFather_'s ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Groups`,
    btnSecretary: `Secretary`,
    btnGuest: `Guest`,
    btnAuto: `Auto-detect`,
    btnGroupAdditions: `Group Additions`,
    btnSecretaryAdditions: `Secretary Additions`,
    btnCriticalErrors: `Critical Errors`,
    btnOn: `ON`,
    btnOff: `OFF`,
    btnClearPrompt: `🗑️ Clear`,
    btnDefaultPrompt: `📝 Default Template`,
    btnOtherPrompt: `✍️ Custom…`,
    btnOtherLang: `🌐 Other…`,
    btnSetbotinfo: `🤖 Update Bot Profile`,
    btnBack: `« Back`,
    btnErrorsShort: `Errors`,

    // Transcription Language Names
    langAuto: `🌐 Auto-detect`,

    // System Notifications
    notifySecConnected: `👔 *Bot is connected as a secretary!*

*User:* {user} (@{username})
*Chat ID:* \`{chat_id}\`
*Status:* {can_reply}`,
    notifySecDisconnected: `👔 *Bot is disconnected as a secretary!*

*User:* {user} (@{username})
*Chat ID:* \`{chat_id}\`
*Status:* {can_reply}`,
    statusCanReply: `can reply in chats`,
    statusCannotReply: `cannot reply in chats`,
    notifyAddedGroup: `🤖 Bot added to group: *{title}* (ID: \`{chat_id}\`){link}`,
    notifyTransError: `🔥 *Transcription Error in chat \`{chat_id}\`:*
\`\`\`\n{error}\n\`\`\``,
    notifyCriticalError: `🔥 *CRITICAL ERROR in Webhook:*
\`\`\`\n{error}\n\`\`\``,
    inviteLink: `Link`,
  },
  ru: {
    noAudio: `⚠️ *Аудио или голосовое сообщение не найдено в цитате.*`,
    help: `Привет! Я — бот-транскрибатор. Отправьте или перешлите мне голосовое сообщение либо аудиофайл, и я расшифрую его в текст.`,
    transcription: `🎤 *Транскрипция:*`,
    error: `⚠️ *Ошибка транскрибации:*`,
    fileTooLarge: `⚠️ *Файл слишком большой.* Telegram Bot API ограничивает загрузку файлов максимум до {max_mb} МБ.`,
    notAudioFile: `⚠️ *Неподдерживаемый формат файла.* Можно расшифровывать только аудио- и видеофайлы.`,
    unsupportedVideo: `⚠️ *Этот формат видео не поддерживается.* Пожалуйста, отправьте аудио или видео в формате MP4/WebM.`,
    apiKeyMissing: `⚠️ *API-ключ не настроен!*
Пожалуйста, установите переменную окружения \`WHISPER_API_KEY\` на вашем сервере, чтобы включить расшифровку аудио.`,
    settingsTitle: `🛠️ *Настройки владельца:*`,
    welcomeMessage: `🤖 *Добро пожаловать в Transcribot!*

Вы успешно зарегистрированы в качестве владельца. Сбросить статус владельца можно на [дашборде]({dashboard_url}).

Команды:
/mode: Управление активными режимами бота (_Группы_, [_Секретарь_](${SECRETARY_URL}), [_Гость_](${GUEST_URL}))
/help: Просмотр всех настроек и команд`,
    
    // Command Descriptions & Roles
    cmdHelp: `Показать эту справку`,
    cmdLang: `Выбрать язык транскрибации`,
    cmdLangbot: `Выбрать язык интерфейса бота`,
    cmdMode: `Управление режимами (_Группы_, [_Секретарь_](${SECRETARY_URL}), [_Гость_](${GUEST_URL}))`,
    cmdModel: `Выбрать модель [Whisper](${STT_API_URL})`,
    cmdNotify: `Настроить уведомления`,
    cmdProcess: `Транскрибировать (_в ответ на медиа_)`,
    cmdPromptUser: `Использовать [кастомный](${WHISPER_PROMPTING_GUIDE_URL}) промпт (_в ответ на медиа_)`,
    cmdPromptAdmin: `Задать [кастомный](${WHISPER_PROMPTING_GUIDE_URL}) промпт Whisper`,
    cmdReadme: `Просмотр README репозитория`,
    cmdConfig: `Управление настройками и конфигурацией бота`,
    cmdSettings: `Показать текущие настройки`,
    cmdSetbotinfo: `Установить/обновить имя и описание бота`,
    cmdVerbose: `Вкл/выкл отображение тех. данных`,
    cmdWebhook: `Просмотр или смена URL вебхука бота`,
    botInfoSuccess: `✅ Имя, описание и краткое описание бота успешно обновлены.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Отказано в доступе: только для администратора.`,
    settingsUpdated: `✅ Настройки успешно обновлены.`,
    webhookUpdateFailed: `❌ Ошибка обновления вебхука: {error}`,
    btnStateOutOfSync: `⚠️ Статус кнопки устарел. Меню настроек обновлено.`,

    // /webhook command
    webhookTitle: `🔗 *Текущий URL вебхука:*
\`{url}\`

Чтобы перенести бота на новый URL, отправьте:
\`/webhook https://new-domain.example.com\`

🖥️ *Панель управления:* {dashboard_url}`,
    webhookMenuText: `Текущий URL: \`{url}\`

Чтобы обновить вебхук бота, отправьте:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Изменить URL…`,
    botVersion: `🤖 ${REPO_LINK} \`v{val}\``,
    webhookHealthChecking: `🔄 Проверяю доступность нового URL…`,
    webhookHealthOk: `✅ *Вебхук успешно обновлён!*

*Новый URL:* \`{url}\`

_Бот перенесён на новый сервер. Этот экземпляр больше не будет получать обновления._`,
    webhookHealthFail: `❌ *Новый URL недоступен.*

*URL:* \`{url}\`
*Ошибка:* {error}

_Вебхук НЕ изменён. Проверьте URL и попробуйте снова._`,

    // Configuration Titles
    modeTitle: `⚙️ *Режимы бота:*

Настройте активные режимы.`,
    langbotTitle: `🌐 *Язык интерфейса бота:*

Выберите язык для интерфейса бота и системных сообщений.`,
    langbotSuccess: `🌐 Язык интерфейса бота установлен на: *{val}*`,
    langTitle: `🗣️ *Whisper: язык транскрибации:*

Выберите язык для транскрибации.`,
    langSuccess: `🗣️ Язык Whisper установлен на: *{val}*`,
    modelTitle: `🤖 *Whisper: модель:*

Выберите модель для транскрибации.`,
    modelSuccess: `🤖 Модель Whisper установлена на: *{val}*`,
    notifyTitle: `🔔 *Уведомления владельца:*

Настройте оповещения, которые получает владелец.`,
    notifyFooterHidden: `💡 _Некоторые типы уведомлений скрыты, так как соответствующие режимы не активны. См. /mode._`,
    verboseTitle: `📝 *Отображение тех. данных:*

Переключает добавление технических данных (формат файла, размер, длительность) к ответам расшифровки.`,
    verboseSuccess: `📝 Отображение тех. данных теперь: *{val}*`,
    promptTitle: `✍️ *Whisper: промпт:*

Чтобы настроить собственный промпт, отправьте команду /prompt, а затем ваш текст.

Текущий промпт: _{val}_`,
    promptDefault: `Шаблон по умолчанию`,
    promptEmpty: `Пустой (без промпта)`,
    promptCustomLabel: `кастомный`,
    promptSuccess: `✍️ Пользовательский промпт Whisper обновлен на:
_"{val}"_{warning}`,
    promptTruncated: `

⚠️ _Примечание: Ваш промпт превысил лимит в ~${MAX_PROMPT_TOKENS} токена и был обрезан._`,

    // Mode capability warnings
    modeFooter: `💡 _Некоторые режимы могут требовать дополнительных разрешений — настройте их через @BotFather или ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *Режим _Группы_ не включён для этого бота.*

Включите его через @BotFather или ${BOTFATHER_APP}:
    → _выберите вашего бота_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *Режим [_Секретаря_](${SECRETARY_URL}) не включён для этого бота.*

Включите его через @BotFather или ${BOTFATHER_APP}:
    → _выберите вашего бота_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Гостевой_](${GUEST_URL}) режим не включён для этого бота.*

Включите его через ${BOTFATHER_APP} от _BotFather_:
    → _выберите вашего бота_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Группы`,
    btnSecretary: `Секретарь`,
    btnGuest: `Гость`,
    btnAuto: `Автоопределение`,
    btnGroupAdditions: `Добавление в группы`,
    btnSecretaryAdditions: `Добавление в секретари`,
    btnCriticalErrors: `Критические ошибки`,
    btnOn: `ВКЛ`,
    btnOff: `ВЫКЛ`,
    btnClearPrompt: `🗑️ Очистить`,
    btnDefaultPrompt: `📝 Шаблон по умолчанию`,
    btnOtherPrompt: `✍️ Свой…`,
    btnOtherLang: `🌐 Другой…`,
    btnSetbotinfo: `🤖 Обновить профиль бота`,
    btnBack: `« Назад`,
    btnErrorsShort: `Ошибки`,

    // Transcription Language Names
    langAuto: `🌐 Автоопределение`,

    // System Notifications
    notifySecConnected: `👔 *Бот подключен в режиме секретаря!*

*Пользователь:* {user} (@{username})
*ID чата:* \`{chat_id}\`
*Статус:* {can_reply}`,
    notifySecDisconnected: `👔 *Бот отключен от режима секретаря!*

*Пользователь:* {user} (@{username})
*ID чата:* \`{chat_id}\`
*Статус:* {can_reply}`,
    statusCanReply: `может отвечать в чатах`,
    statusCannotReply: `не может отвечать в чатах`,
    notifyAddedGroup: `🤖 Бот добавлен в группу: *{title}* (ID: \`{chat_id}\`){link}`,
    notifyTransError: `🔥 *Ошибка транскрибации в чате \`{chat_id}\`:*
\`\`\`\n{error}\n\`\`\``,
    notifyCriticalError: `🔥 *КРИТИЧЕСКАЯ ОШИБКА в Вебхуке:*
\`\`\`\n{error}\n\`\`\``,
    inviteLink: `Ссылка`,
  },
  de: {
    noAudio: `⚠️ *In der Antwort wurde keine Audio- oder Sprachnachricht gefunden.*`,
    help: `Hallo! Ich bin ein Transkriptions-Bot. Senden oder leiten Sie mir eine Sprachnachricht oder eine Audiodatei weiter, und ich werde sie in Text umwandeln.`,
    transcription: `🎤 *Transkription:*`,
    error: `⚠️ *Transkriptionsfehler:*`,
    fileTooLarge: `⚠️ *Die Datei ist zu groß.* Die Telegram-Bot-API beschränkt Downloads auf maximal {max_mb} MB.`,
    notAudioFile: `⚠️ *Nicht unterstütztes Dateiformat.* Es können nur Audio- und Videodateien transkribiert werden.`,
    unsupportedVideo: `⚠️ *Dieses Videoformat wird nicht unterstützt.* Bitte senden Sie Audio oder Video im MP4/WebM-Format.`,
    apiKeyMissing: `⚠️ *API-Schlüssel ist nicht konfiguriert!*
Bitte legen Sie die Umgebungsvariable \`WHISPER_API_KEY\` auf Ihrem Server fest, um die Transkription zu aktivieren.`,
    settingsTitle: `🛠️ *Eigentümer-Einstellungen:*`,
    welcomeMessage: `🤖 *Willkommen bei Transcribot!*

Sie wurden erfolgreich als Besitzer registriert. Sie können den Besitzer-Status im [Dashboard]({dashboard_url}) zurücksetzen.

Befehle:
/mode: Bot-Modi umschalten (_Gruppen_, [_Sekretär_](${SECRETARY_URL}), [_Gäste_](${GUEST_URL}))
/help: Alle Einstellungen und Befehle anzeigen`,
    
    // Command Descriptions & Roles
    cmdHelp: `Diese Hilfe anzeigen`,
    cmdLang: `Transkriptionssprache einstellen`,
    cmdLangbot: `Sprache der Benutzeroberfläche einstellen`,
    cmdMode: `Bot-Modi umschalten (_Gruppen_, [_Sekretär_](${SECRETARY_URL}), [_Gäste_](${GUEST_URL}))`,
    cmdModel: `[Whisper](${STT_API_URL})-Modell auswählen`,
    cmdNotify: `Benachrichtigungen konfigurieren`,
    cmdProcess: `Transkribieren (_als Antwort auf Medien_)`,
    cmdPromptUser: `[Benutzerdefinierten](${WHISPER_PROMPTING_GUIDE_URL}) Prompt verwenden (_als Antwort auf Medien_)`,
    cmdPromptAdmin: `[Benutzerdefinierten](${WHISPER_PROMPTING_GUIDE_URL}) Whisper-Prompt einstellen`,
    cmdReadme: `Repository-README anzeigen`,
    cmdConfig: `Bot-Einstellungen und Konfiguration verwalten`,
    cmdSettings: `Aktuelle Einstellungen anzeigen`,
    cmdSetbotinfo: `Bot-Name und Beschreibungen aktualisieren`,
    cmdVerbose: `Technische Daten umschalten`,
    cmdWebhook: `Webhook-URL des Bots anzeigen oder ändern`,
    botInfoSuccess: `✅ Bot-Name, Beschreibung und Kurzbeschreibung wurden erfolgreich aktualisiert.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Nicht autorisiert: Nur für Administratoren.`,
    settingsUpdated: `✅ Einstellungen erfolgreich aktualisiert.`,
    webhookUpdateFailed: `❌ Webhook-Aktualisierung fehlgeschlagen: {error}`,
    btnStateOutOfSync: `⚠️ Der Tastenstatus war veraltet. Das Menü wurde aktualisiert.`,

    // /webhook command
    webhookTitle: `🔗 *Aktuelle Webhook-URL:*
\`{url}\`

Um den Bot auf eine neue URL zu verschieben, senden Sie:
\`/webhook https://new-domain.example.com\`

🖥️ *Dashboard:* {dashboard_url}`,
    webhookMenuText: `Aktuelle URL: \`{url}\`

Um den Webhook des Bots zu aktualisieren, senden Sie:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ URL ändern…`,
    botVersion: `🤖 ${REPO_LINK} \`v{val}\``,
    webhookHealthChecking: `🔄 Verfügbarkeit der neuen URL wird geprüft…`,
    webhookHealthOk: `✅ *Webhook erfolgreich aktualisiert!*

*Neue URL:* \`{url}\`

_Der Bot wurde auf den neuen Server verschoben. Diese Instanz empfängt keine Updates mehr._`,
    webhookHealthFail: `❌ *Neue URL ist nicht erreichbar.*

*URL:* \`{url}\`
*Fehler:* {error}

_Der Webhook wurde NICHT geändert. Bitte überprüfen Sie die URL und versuchen Sie es erneut._`,

    // Configuration Titles
    modeTitle: `⚙️ *Bot-Modi:*

Konfigurieren Sie die aktiven Modi.`,
    langbotTitle: `🌐 *Sprache der Benutzeroberfläche:*

Wählen Sie die Sprache für die Bot-Benutzeroberfläche und Systemmeldungen.`,
    langbotSuccess: `🌐 Sprache der Benutzeroberfläche eingestellt auf: *{val}*`,
    langTitle: `🗣️ *Whisper: Transkriptionssprache:*

Wählen Sie die Sprache für die Transkription.`,
    langSuccess: `🗣️ Whisper-Sprache eingestellt auf: *{val}*`,
    modelTitle: `🤖 *Whisper: Modell:*

Wählen Sie das Modell für die Transkription.`,
    modelSuccess: `🤖 Whisper-Modell eingestellt auf: *{val}*`,
    notifyTitle: `🔔 *Benachrichtigungen des Eigentümers:*

Konfigurieren Sie, welche Warnungen der Eigentümer erhält.`,
    notifyFooterHidden: `💡 _Einige Benachrichtigungstypen sind ausgeblendet, da die entsprechenden Modi nicht aktiv sind. Siehe /mode._`,
    verboseTitle: `📝 *Technische Daten anzeigen:*

Schaltet um, ob technische Daten (Dateiformat, Größe, Dauer) an die Transkriptionsantworten angehängt werden.`,
    verboseSuccess: `📝 Technische Daten anzeigen ist jetzt: *{val}*`,
    promptTitle: `✍️ *Whisper: Prompt:*

Um einen benutzerdefinierten Prompt zu konfigurieren, senden Sie den Befehl /prompt gefolgt von Ihrem Text.

Aktuell prompt: _{val}_`,
    promptDefault: `Standard-Vorlage`,
    promptEmpty: `Leer (kein Prompt)`,
    promptCustomLabel: `benutzerdefinierten`,
    promptSuccess: `✍️ Benutzerdefinierter Whisper-Prompt aktualisiert auf:
_"{val}"_{warning}`,
    promptTruncated: `

⚠️ _Hinweis: Ihr Prompt hat das Limit von ~${MAX_PROMPT_TOKENS} Token überschritten und wurde gekürzt._`,

    // Mode capability warnings
    modeFooter: `💡 _Einige Modi erfordern möglicherweise zusätzliche Berechtigungen — konfigurieren Sie diese über @BotFather oder ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *_Gruppen_-Modus ist für diesen Bot nicht aktiviert.*

Aktivieren Sie ihn über @BotFather oder ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *[_Sekretär_](${SECRETARY_URL})-Modus ist für diesen Bot nicht aktiviert.*

Aktivieren Sie ihn über @BotFather oder ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Gast_](${GUEST_URL})-Modus ist für diesen Bot nicht aktiviert.*

Aktivieren Sie ihn über _BotFather_'s ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Gruppen`,
    btnSecretary: `Sekretär`,
    btnGuest: `Gast`,
    btnAuto: `Automatisch`,
    btnGroupAdditions: `Gruppen-Hinzufügung`,
    btnSecretaryAdditions: `Sekretär-Hinzufügungen`,
    btnCriticalErrors: `Kritische Fehler`,
    btnOn: `AN`,
    btnOff: `AUS`,
    btnClearPrompt: `🗑️ Löschen`,
    btnDefaultPrompt: `📝 Standard-Vorlage`,
    btnOtherPrompt: `✍️ Eigener…`,
    btnOtherLang: `🌐 Anderer…`,
    btnSetbotinfo: `🤖 Bot-Profil aktualisieren`,
    btnBack: `« Zurück`,
    btnErrorsShort: `Fehler`,

    // Transcription Language Names
    langAuto: `🌐 Automatisch`,

    // System Notifications
    notifySecConnected: `👔 *Bot ist als Sekretär verbunden!*

*Benutzer:* {user} (@{username})
*Chat-ID:* \`{chat_id}\`
*Status:* {can_reply}`,
    notifySecDisconnected: `👔 *Bot-Verbindung als Sekretär getrennt!*

*Benutzer:* {user} (@{username})
*Chat-ID:* \`{chat_id}\`
*Status:* {can_reply}`,
    statusCanReply: `kann in Chats antworten`,
    statusCannotReply: `kann nicht in Chats antworten`,
    notifyAddedGroup: `🤖 Bot zur Gruppe hinzugefügt: *{title}* (ID: \`{chat_id}\`){link}`,
    notifyTransError: `🔥 *Transkriptionsfehler im Chat \`{chat_id}\`:*
\`\`\`\n{error}\n\`\`\``,
    notifyCriticalError: `🔥 *KRITISCHER FEHLER im Webhook:*
\`\`\`\n{error}\n\`\`\``,
    inviteLink: `Link`,
  },
  uk: {
    noAudio: `⚠️ *Аудіо або голосове повідомлення не знайдено в цитаті.*`,
    help: `Привіт! Я — бот-транскрибатор. Надішліть або перешліть мені голосове повідомлення або аудіофайл, і я розшифрую його в текст.`,
    transcription: `🎤 *Транскрипція:*`,
    error: `⚠️ *Помилка транскрибації:*`,
    fileTooLarge: `⚠️ *Файл занадто великий.* Telegram Bot API обмежує завантаження файлів максимум до {max_mb} МБ.`,
    notAudioFile: `⚠️ *Непідтримуваний формат файлу.* Можна розшифровувати тільки аудіо- та відеофайли.`,
    unsupportedVideo: `⚠️ *Цей формат відео не підтримується.* Будь ласка, надішліть аудіо або відео у форматі MP4/WebM.`,
    apiKeyMissing: `⚠️ *API-ключ не налаштований!*
Будь ласка, встановіть змінну оточення \`WHISPER_API_KEY\` на вашому сервері, щоб увімкнути транскрибацію.`,
    settingsTitle: `🛠️ *Налаштування власника:*`,
    welcomeMessage: `🤖 *Ласкаво просимо до Transcribot!*

Ви успішно зареєстровані як власник. Скинути статус власника можна на [дашборді]({dashboard_url}).

Команди:
/mode: Керування активними режимами бота (_Групи_, [_Секретар_](${SECRETARY_URL}), [_Гість_](${GUEST_URL}))
/help: Перегляд усіх налаштувань та команд`,
    
    // Command Descriptions & Roles
    cmdHelp: `Показати цю довідку`,
    cmdLang: `Вибрати мову транскрибації`,
    cmdLangbot: `Вибрати мову інтерфейсу бота`,
    cmdMode: `Керування режимами (_Групи_, [_Секретар_](${SECRETARY_URL}), [_Гість_](${GUEST_URL}))`,
    cmdModel: `Вибирати модель [Whisper](${STT_API_URL})`,
    cmdNotify: `Налаштувати сповіщення`,
    cmdProcess: `Транскрибувати (_у відповідь на медіа_)`,
    cmdPromptUser: `Використовувати [власний](${WHISPER_PROMPTING_GUIDE_URL}) промпт (_у відповідь на медіа_)`,
    cmdPromptAdmin: `Задати [власний](${WHISPER_PROMPTING_GUIDE_URL}) промпт Whisper`,
    cmdReadme: `Перегляд README репозиторію`,
    cmdConfig: `Керування налаштуваннями та конфігурацією бота`,
    cmdSettings: `Покази поточні налаштування`,
    cmdSetbotinfo: `Встановити/оновити ім'я та опис бота`,
    cmdVerbose: `Увімкнути/вимкнути тех. дані`,
    cmdWebhook: `Переглянути або змінити URL вебхука бота`,
    botInfoSuccess: `✅ Ім'я, опис та короткий опис бота успішно оновлено.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Відмовлено в доступі: тільки для адміністратора.`,
    settingsUpdated: `✅ Налаштування успішно оновлено.`,
    webhookUpdateFailed: `❌ Помилка оновлення вебхука: {error}`,
    btnStateOutOfSync: `⚠️ Статус кнопки застарів. Меню налаштувань оновлено.`,

    // /webhook command
    webhookTitle: `🔗 *Поточний URL вебхука:*
\`{url}\`

Щоб перенести бота на новий URL, надішліть:
\`/webhook https://new-domain.example.com\`

🖥️ *Панель управління:* {dashboard_url}`,
    webhookMenuText: `Поточний URL: \`{url}\`

Щоб оновити вебхук бота, надішліть:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Змінити URL…`,
    botVersion: `🤖 ${REPO_LINK} \`v{val}\``,
    webhookHealthChecking: `🔄 Перевіряю доступність нового URL…`,
    webhookHealthOk: `✅ *Вебхук успішно оновлено!*

*Новий URL:* \`{url}\`

_Бот перенесений на новий сервер. Цей екземпляр більше не отримуватиме оновлень._`,
    webhookHealthFail: `❌ *Новий URL недоступний.*

*URL:* \`{url}\`
*Помилка:* {error}

_Вебхук НЕ змінено. Перевірте URL і спробуйте знову._`,

    // Configuration Titles
    modeTitle: `⚙️ *Режими бота:*

Налаштуйте активні режими.`,
    langbotTitle: `🌐 *Мова інтерфейсу бота:*

Виберіть мову для інтерфейсу бота та системних повідомлень.`,
    langbotSuccess: `🌐 Мова інтерфейсу бота встановлена на: *{val}*`,
    langTitle: `🗣️ *Whisper: мова транскрибації:*

Виберіть мову для транскрибації.`,
    langSuccess: `🗣️ Мова Whisper встановлена на: *{val}*`,
    modelTitle: `🤖 *Whisper: модель:*

Виберіть модель для транскрибації.`,
    modelSuccess: `🤖 Модель Whisper встановлена на: *{val}*`,
    notifyTitle: `🔔 *Сповіщення власника:*

Налаштуйте сповіщення, які отримує власник.`,
    notifyFooterHidden: `💡 _Деякі типи сповіщень приховані, оскільки відповідні режими не активні. Див. /mode._`,
    verboseTitle: `📝 *Відображення тех. даних:*

Перемикає додавання технічних даних (формат файлу, размер, тривалість) до відповідей розшифровки.`,
    verboseSuccess: `📝 Відображення тех. даних тепер: *{val}*`,
    promptTitle: `✍️ *Whisper: промпт:*

Щоб налаштувати власний промпт, надішліть команду /prompt, а потім ваш текст.

Поточний промпт: _{val}_`,
    promptDefault: `Шаблон за замовчуванням`,
    promptEmpty: `Порожній (без промпту)`,
    promptCustomLabel: `власний`,
    promptSuccess: `✍️ Власний промпт Whisper оновлено на:
_"{val}"_{warning}`,
    promptTruncated: `

⚠️ _Примітка: Ваш промпт перевищив лимит у ~${MAX_PROMPT_TOKENS} токени і був обрізаний._`,

    // Mode capability warnings
    modeFooter: `💡 _Деякі режими можуть вимагати додаткових дозволів — налаштуйте їх через @BotFather або ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *_Групи_ не увімкнено для цього бота.*

Увімкніть його через @BotFather или ${BOTFATHER_APP}:
    → _оберіть вашого бота_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *Режим [_Секретаря_](${SECRETARY_URL}) не увімкнено для цього бота.*

Увімкніть його через @BotFather або ${BOTFATHER_APP}:
    → _оберіть вашого бота_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Гостьовий_](${GUEST_URL}) режим не увімкнено для цього бота.*

Увімкніть його через ${BOTFATHER_APP} від _BotFather_:
    → _оберіть вашого бота_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Групи`,
    btnSecretary: `Секретар`,
    btnGuest: `Гість`,
    btnAuto: `Автовизначення`,
    btnGroupAdditions: `Додавання до груп`,
    btnSecretaryAdditions: `Додавання в секретарі`,
    btnCriticalErrors: `Критичні помилки`,
    btnOn: `УВІМК`,
    btnOff: `ВИМК`,
    btnClearPrompt: `🗑️ Очистити`,
    btnDefaultPrompt: `📝 Шаблон за замовчуванням`,
    btnOtherPrompt: `✍️ Свій…`,
    btnOtherLang: `🌐 Інший…`,
    btnSetbotinfo: `🤖 Оновити профіль бота`,
    btnBack: `« Назад`,
    btnErrorsShort: `Помилки`,

    // Transcription Language Names
    langAuto: `🌐 Автовизначення`,

    // System Notifications
    notifySecConnected: `👔 *Бот підключений у режимі секретаря!*

*Користувач:* {user} (@{username})
*ID чату:* \`{chat_id}\`
*Статус:* {can_reply}`,
    notifySecDisconnected: `👔 *Бот відключений від режиму секретаря!*

*Користувач:* {user} (@{username})
*ID чату:* \`{chat_id}\`
*Статус:* {can_reply}`,
    statusCanReply: `може відповідати в чатах`,
    statusCannotReply: `не може відповідати в чатах`,
    notifyAddedGroup: `🤖 Бот доданий до групи: *{title}* (ID: \`{chat_id}\`){link}`,
    notifyTransError: `🔥 *Помилка транскрибації в чаті \`{chat_id}\`:*
\`\`\`\n{error}\n\`\`\``,
    notifyCriticalError: `🔥 *КРИТИЧНА ПОМИЛКА у Вебхуці:*
\`\`\`\n{error}\n\`\`\``,
    inviteLink: `Посилання`,
  }
};

configureLocalization(translations);

export { getTranslation, getMarkdown, getUserLang, hasTranslation } from './framework/localize.js';

