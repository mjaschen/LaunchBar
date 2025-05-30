/*
ChaptGPT Action for LaunchBar
by Christian Bender (@ptujec)
2023-03-03

Copyright see: https://github.com/Ptujec/LaunchBar/blob/master/LICENSE

Documentation:
- https://platform.openai.com/docs/api-reference/chat
- https://platform.openai.com/docs/guides/chat/introduction
- https://developer.obdev.at/launchbar-developer-documentation/#/javascript-http

Prompts: 
- https://prompts.chat/

TODO: 
- Refactor (simplify code, use let and const)
- localization (German)
*/

String.prototype.localizationTable = 'default';

include('browser.js');
include('editors.js');

const recommendedModel = 'gpt-4.1-mini';
const apiKey = Action.preferences.apiKey;
const recentTimeStamp = Action.preferences.recentTimeStamp;
const chatsFolder = Action.supportPath + '/chats/';
const presets = File.readJSON(Action.path + '/Contents/Resources/presets.json');
const userPresetsPath = Action.supportPath + '/userPresets.json';
const currentActionVersion = Action.version;
const lastUsedActionVersion = Action.preferences.lastUsedActionVersion ?? '2.0';

function run(argument) {
  // ON FIRST RUN COPY PRESETS TO ACTION SUPPORT

  if (!File.exists(userPresetsPath)) {
    File.writeJSON(presets, userPresetsPath);
  } else {
    // CHECK IF LB CAN READ THE CUSTOM JSON
    try {
      const test = File.readJSON(userPresetsPath);
    } catch (e) {
      const response = LaunchBar.alert(
        e,
        'You can either start fresh or try to fix your custom presets JSON code.'.localize(),
        'Start fresh'.localize(),
        'Edit presets'.localize(),
        'Cancel'.localize()
      );
      switch (response) {
        case 0:
          // Start fresh
          File.writeJSON(presets, userPresetsPath);
          break;
        case 1:
          editPresets();
          break;
        case 2:
          break;
      }
      return;
    }
  }

  // CHECK/SET API KEY
  if (!apiKey) return setApiKey();

  // SETTINGS
  if (LaunchBar.options.alternateKey) return settings();

  // IF NO ARGUMENT IS PASSED
  if (!argument) {
    // CHECK FOR NEW PRESETS
    if (isNewerVersion(lastUsedActionVersion, currentActionVersion)) {
      // Compare presets with user presets
      const newPresetsList = comparePresets() || undefined;

      if (newPresetsList != undefined) {
        // Offer updating presets if they don't match
        const response = LaunchBar.alert(
          'Update presets?',
          'The following presets are new or missing in your user presets:\n' +
            newPresetsList +
            '\nWould you like to add them to your user presets?',
          'Ok',
          'Cancel'
        );
        switch (response) {
          case 0:
            // Update
            updatePresets();
            break;
          case 1:
            break;
        }
      }
      // Save current version number
      Action.preferences.lastUsedActionVersion = Action.version;
    }

    // SHOW PREDEFINED PROMPTS
    if (!LaunchBar.options.commandKey) {
      return prompts();
    }

    // DISPLAY RECENT CHATS
    // GET CHATS
    if (!File.exists(chatsFolder)) {
      return {
        title: 'No folder with chats found!'.localize(),
        icon: 'weasel_alert',
      };
    }

    const chatFiles = LaunchBar.execute('/bin/ls', '-t', chatsFolder)
      .trim()
      .split('\n');

    if (chatFiles == '') {
      return {
        title: 'No chats found!'.localize(),
        icon: 'weasel_alert',
      };
    }

    return chatFiles.map((item) => ({
      path: `${chatsFolder}${item}`,
    }));
  }

  // IF ARGUMENT IS PASSED

  // CHOOSE PERSONA
  if (LaunchBar.options.commandKey) return showPersonas(argument);

  // OPTIONS
  // (e.g. continue with chat, add url, …)
  return options({ argument });
}

function options(dict) {
  const argument = dict.argument;
  const defaultPersonaIcon = Action.preferences.defaultPersonaIcon ?? 'weasel';

  var result = [
    {
      title: 'New Chat',
      subtitle: 'Asks: ' + argument,
      alwaysShowsSubtitle: true,
      icon: dict.icon ?? defaultPersonaIcon,
      action: 'ask',
      actionArgument: {
        argument,
        icon: dict.icon ?? defaultPersonaIcon,
      },
      actionRunsInBackground: true,
    },
  ];

  // GET MOST RECENT CHAT
  const recentChat = Action.preferences.recentChat;

  if (
    recentChat != undefined &&
    recentChat.path != undefined &&
    File.exists(recentChat.path)
  ) {
    var recentFileTitle = File.displayName(recentChat.path).replace(
      /\.md$/,
      ''
    );

    var pushData = {
      title: 'Continue: ' + recentFileTitle,
      subtitle: 'Asks: ' + argument,
      alwaysShowsSubtitle: true,
      icon: dict.icon ?? recentChat.icon ?? defaultPersonaIcon,
      action: 'ask',
      actionArgument: {
        argument,
        presetTitle: recentChat.presetTitle,
        addRecent: true,
        icon: dict.icon ?? recentChat.icon ?? defaultPersonaIcon,
        recentPath: recentChat.path,
        recentFileTitle: recentFileTitle,
        persona: recentChat.persona ?? undefined,
        isPrompt: recentChat.isPrompt,
      },
      actionRunsInBackground: true,
    };

    var recentBadge = recentChat.presetTitle;
    var defaultPersonaTitle =
      Action.preferences.defaultPersonaTitle ??
      File.readJSON(userPresetsPath).personas[0].title; // default

    if (recentBadge != defaultPersonaTitle && recentChat.isPrompt != true) {
      pushData.badge = recentBadge;
    }

    result.push(pushData);

    // Reverse order if recent was created less than five minutes ago
    const timeDifference = (new Date() - new Date(recentTimeStamp)) / 60000;
    if (timeDifference < 5) {
      result.reverse();
    }
  }

  // SHOW CONTEXT OPTIONS
  result.push(
    {
      title: 'Add Website',
      subtitle: 'Asks: ' + argument,
      alwaysShowsSubtitle: true,
      action: 'ask',
      icon: 'weasel_web',
      actionArgument: {
        argument: argument + '\n',
        addURL: true,
        icon: dict.icon ?? 'weasel_web',
      },
      actionRunsInBackground: true,
    },
    {
      title: 'Add Clipboard',
      subtitle: 'Asks: ' + argument,
      alwaysShowsSubtitle: true,
      action: 'ask',
      icon: 'weasel_clipboard',
      actionArgument: {
        argument: argument + '\n',
        addClipboard: true,
        icon: dict.icon ?? 'weasel_clipboard',
      },
      actionRunsInBackground: true,
    }
  );

  if (dict.persona != undefined) {
    result.forEach(function (item) {
      item.badge = dict.presetTitle; // persona title
      item.actionArgument.persona = dict.persona;
      item.actionArgument.presetTitle = dict.presetTitle; // persona  title
    });
  }

  return result;
}

function ask(dict) {
  // LaunchBar.alert('Ask:\n' + JSON.stringify(dict));
  // return;

  let argument = dict.argument.trim();

  if (dict.isPrompt) {
    var title = dict.presetTitle ?? argument; // for (new) file name
  } else {
    var title = argument;
  }

  // ITEMS WITH CLIPBOARD CONTENT
  if (dict.addClipboard == true) {
    const clipboard = LaunchBar.getClipboardString().trim();

    var displayClipboard = clipboard;
    if (displayClipboard.length > 500) {
      displayClipboard = displayClipboard.substring(0, 500) + '…';
    }

    var response = LaunchBar.alert(
      argument.trim(),
      '"' + displayClipboard + '"',
      'Ok',
      'Cancel'
    );
    switch (response) {
      case 0:
        title = title + ' - ' + clipboard;
        argument += '\n\n' + clipboard;
        break;
      case 1:
        return;
    }
  }

  LaunchBar.hide();

  // ITEMS WITH URL
  if (dict.addURL == true) {
    var currentURL = getCurrentURL();
    if (currentURL != undefined) {
      title =
        title +
        ' - ' +
        currentURL
          .replace(/[&~#@[\]{}\\\/%*$:;,.\?><\|"“]+/g, '_')
          .replace(/https?|www/g, '')
          .replace(/^_+|_+$/g, '')
          .trim();

      argument += ' ' + currentURL;
    } else {
      return;
    }
  }

  var question = argument; // position is important becaus of addClipboard & addURL

  // INCLUDE PREVIOUS CHAT HISTORY?
  var addRecent = dict.addRecent;
  if (addRecent == true) {
    var recentPath = dict.recentPath;

    if (!File.exists(recentPath)) {
      return;
    }

    // Add thread for context
    var text = File.readText(recentPath).replace(/^> /gm, '');
    question = text + '...' + argument + '\n';

    var title = dict.recentFileTitle;
  } else {
    // TITLE CLEANUP
    title = title
      .replace(/[&~=§#@[\]{}()+\\\/%*$:;,.?><\|"“'´]/g, ' ')
      .replace(/[\s_]{2,}/g, ' ');

    if (title.length > 80) {
      title = title.substring(0, 80) + '…';
    }
  }

  // MODEL
  var model = Action.preferences.model ?? recommendedModel;

  // PERSONA
  // GET DEFAULT
  var defaultPersona =
    Action.preferences.persona ??
    File.readJSON(userPresetsPath).personas[0].persona;

  // PRIORITIZE INPUT PERSONA
  var persona = dict.persona ?? defaultPersona;

  // alertWhenRunningInBackground('Title: ' + title);
  // alertWhenRunningInBackground('Argument: ' + argument);
  // alertWhenRunningInBackground('Persona: ' + persona);
  // return;

  // API CALL
  var result = HTTP.postJSON('https://api.openai.com/v1/chat/completions', {
    headerFields: {
      Authorization: 'Bearer ' + apiKey,
    },
    body: {
      model: model,
      messages: [
        { role: 'system', content: persona },
        { role: 'user', content: question },
      ],
    },
  });

  // File.writeJSON(result, Action.supportPath + '/test.json');
  // var result = File.readJSON(Action.supportPath + '/test.json');

  // ADDITIONAL INFO FOR STORING RECENT INFO IN THE NEXT STEP
  var presetTitle =
    dict.presetTitle ??
    Action.preferences.defaultPersonaTitle ??
    File.readJSON(userPresetsPath).personas[0].title; // default

  var icon = dict.icon; // might need fallback(s) to default
  const isPrompt = dict.isPrompt;
  const useCompare = dict.useCompare;

  processResult(
    result,
    argument,
    title,
    persona,
    icon,
    presetTitle,
    isPrompt,
    useCompare
  );
}

function processResult(
  result,
  argument,
  title,
  persona,
  icon,
  presetTitle,
  isPrompt,
  useCompare
) {
  // ERROR HANDLING
  if (result.response == undefined) {
    alertWhenRunningInBackground(result.error);
    return;
  }

  if (result.response.status != 200) {
    // TODO: Offer to open https://chat.openai.com on 429

    let details;
    if (result.data != undefined) {
      const data = JSON.parse(result.data);
      if (data.error != undefined) {
        details = data.error.message;
      }
    }

    alertWhenRunningInBackground(
      result.response.status + ': ' + details ?? result.response.localizedStatus
    );
    return;
  }

  // PARSE RESULT
  let data = JSON.parse(result.data);
  const answer = data.choices[0].message.content.trim();

  // PLAY CONFIRMATION SOUND
  LaunchBar.execute(
    '/usr/bin/afplay',
    '/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/acknowledgment_sent.caf'
  );

  // COPY RESULT TO CLIPBOARD
  const originalClipboard = LaunchBar.getClipboardString();
  LaunchBar.setClipboardString(answer);

  // COMPARE INPUT TO ANSWER IN BBEDIT
  if (useCompare) {
    // Do compare stuff
    return compareTexts(originalClipboard, answer); // end here don't create chat file
  }

  // CREATE/OPEN CHAT TEXT FILE
  const fileLocation = chatsFolder + title + '.md';
  const recentChatDict = {
    persona,
    presetTitle,
    icon,
    path: fileLocation,
    isPrompt,
  };
  openChatTextFile(argument, fileLocation, answer, recentChatDict);
}

function prompts() {
  if (!File.exists(userPresetsPath)) return;

  const prompts = File.readJSON(userPresetsPath).prompts;

  return prompts.map((item) => ({
    title: item.title,
    subtitle: item.description,
    alwaysShowsSubtitle: true,
    icon: item.icon,
    action: 'ask',
    actionArgument: {
      presetTitle: item.title,
      argument: item.argument,
      persona: item.persona,
      icon: item.icon,
      addClipboard: item.addClipboard,
      addURL: item.addURL,
      useCompare: item.useCompare || false,
      isPrompt: true,
    },
    actionRunsInBackground: true,
  }));
}

function showPersonas(argument) {
  if (!File.exists(userPresetsPath)) {
    return;
  }

  const personas = File.readJSON(userPresetsPath).personas;

  var result = [];
  personas.forEach(function (item) {
    var pushData = {
      title: item.title.localize(),
      subtitle: item.description.localize(),
      alwaysShowsSubtitle: true,
      icon: item.icon,
      action: 'setPersona',
      actionArgument: {
        persona: item.persona, // default persona
        title: item.title, // default persona title (for Settings)
        icon: item.icon, // default persona icon
      },
    };

    if (argument != undefined) {
      pushData.subtitle = 'Asks: ' + argument;
      pushData.action = 'options';
      pushData.actionArgument.argument = argument;
      pushData.actionArgument.title = undefined;
      pushData.actionArgument.presetTitle = item.title;
    }

    result.push(pushData);
  });
  return result;
}

function alertWhenRunningInBackground(alertMessage) {
  LaunchBar.executeAppleScript('tell application "LaunchBar" to activate');
  LaunchBar.alert(alertMessage);
  LaunchBar.hide();
}

function openChatTextFile(argument, fileLocation, answer, recentChatDict) {
  // CREATE TEXT FILE
  let quotetArgument = [];
  argument.split('\n').forEach(function (item) {
    quotetArgument.push('> ' + item);
  });

  let text = quotetArgument.join('\n') + '\n\n' + answer;

  if (!File.exists(chatsFolder)) File.createDirectory(chatsFolder);

  if (File.exists(fileLocation)) {
    text = File.readText(fileLocation) + '\n\n' + text;
  }

  File.writeText(text, fileLocation);

  // Open File
  const fileURL = File.fileURLForPath(fileLocation);
  LaunchBar.openURL(fileURL, Action.preferences.EditorID);

  // STORE TIMESTAMP
  Action.preferences.recentTimeStamp = new Date().toISOString();

  // STORE USED PERSONA PROPERTIES
  // Preset prompts have an icon. They can also have a persona. The title is the prompt title not of the persona. But it does not really matter.

  Action.preferences.recentChat = recentChatDict;
}

function compareTexts(originalClipboard, answer) {
  // Check if BBEdit is installed
  if (!File.exists('/Applications/BBEdit.app')) {
    return {
      title: 'BBEdit is not installed',
      icon: 'weasel_alert',
    };
  }

  const timeStamp = new Date().toISOString().replace(/-|:|\./g, '');
  const weaselDir = `/tmp/weasel_compare/${timeStamp}`;
  const originalTextFile = `${weaselDir}/original.txt`;
  const answerTextFile = `${weaselDir}/answer.txt`;

  File.createDirectory(weaselDir);
  File.writeText(originalClipboard, originalTextFile);
  File.writeText(answer, answerTextFile);

  LaunchBar.executeAppleScript(
    'tell application "BBEdit"',
    '	activate',
    `	set theResult to compare file ("${originalTextFile}" as POSIX file) against file ("${answerTextFile}" as POSIX file)`,
    'end tell'
  );
}

// SETTING FUNCTIONS

function settings() {
  return [
    {
      title: 'Choose default persona'.localize(),
      icon: Action.preferences.defaultPersonaIcon ?? 'weasel',
      badge:
        Action.preferences.defaultPersonaTitle ??
        File.readJSON(userPresetsPath).personas[0].title,
      children: showPersonas(),
    },
    {
      title: 'Choose editor to display chats'.localize(),
      icon: 'eyeTemplate',
      badge: Action.preferences.EditorName ?? 'default',
      // action: 'chooseEditor',
      children: chooseEditor(),
    },
    {
      title: 'Choose model'.localize(),
      icon: 'gearTemplate',
      badge: Action.preferences.model ?? recommendedModel,
      action: 'showModels',
    },
    {
      title: 'Set API Key'.localize(),
      icon: 'keyTemplate',
      action: 'setApiKey',
    },
    {
      title: 'Customize personas & prompts'.localize(),
      icon: 'codeTemplate',
      action: 'editPresets',
    },
    {
      title: 'Update personas & prompts'.localize(),
      icon: 'updateTemplate',
      action: 'updatePresets',
    },
    {
      title: 'Reset personas & prompts'.localize(),
      icon: 'sparkleTemplate',
      action: 'resetPresets',
    },
  ];
}

function setPersona(dict) {
  Action.preferences.defaultPersona = dict.persona;
  Action.preferences.defaultPersonaTitle = dict.title;
  Action.preferences.defaultPersonaIcon = dict.icon;
  return settings();
}

function showModels() {
  const currentModel = Action.preferences.model || recommendedModel;

  const result = HTTP.getJSON('https://api.openai.com/v1/models', {
    headerFields: {
      Authorization: `Bearer ${Action.preferences.apiKey}`,
    },
  });

  if (result.response.status !== 200) {
    return LaunchBar.alert(
      `Error ${result.response.status}`,
      result.response.localizedStatus
    );
  }

  const modelsData = result.data.data;

  return (
    modelsData
      // Filter out versions that are not compatible with completions https://platform.openai.com/docs/models#model-endpoint-compatibility
      .filter(
        (item) =>
          item.id.startsWith('gpt-') &&
          !item.id.includes('realtime-preview') &&
          !item.id.includes('audio')
      )
      // .sort((a, b) => a.id > b.id)
      .map((item) => ({
        title: item.id,
        icon:
          currentModel === item.id ? 'checkTemplate.png' : 'circleTemplate.png',
        action: 'setModel',
        actionArgument: item.id,
        badge:
          item.id === recommendedModel ? 'Recommended'.localize() : undefined,
      }))
  );
}

function setModel(model) {
  Action.preferences.model = model;
  return settings();
}

function editPresets() {
  LaunchBar.hide();
  LaunchBar.openURL(File.fileURLForPath(userPresetsPath));
}

function isNewerVersion(lastUsedActionVersion, currentActionVersion) {
  const lastUsedParts = lastUsedActionVersion.split('.');
  const currentParts = currentActionVersion.split('.');
  for (var i = 0; i < currentParts.length; i++) {
    const a = ~~currentParts[i]; // parse int
    const b = ~~lastUsedParts[i]; // parse int
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function comparePresets() {
  if (!File.exists(userPresetsPath)) return;

  const userPresets = File.readJSON(userPresetsPath);
  const allPresets = [...presets.prompts, ...presets.personas];
  const userPresetTitles = [
    ...userPresets.prompts,
    ...userPresets.personas,
  ].map((item) => item.title);
  const newPresetTitles = allPresets.filter(
    (item) => !userPresetTitles.includes(item.title)
  );

  return newPresetTitles.length > 0 ? newPresetTitles.join('\n') : '';
}

function updatePresets() {
  if (!File.exists(userPresetsPath)) return;

  var personaCount = 0;
  var promptCount = 0;

  var userPresets = File.readJSON(userPresetsPath);
  var userPrompts = userPresets.prompts;

  var userPromptTitles = [];
  userPrompts.forEach(function (item) {
    userPromptTitles.push(item.title);
  });

  presets.prompts.forEach(function (item) {
    if (!userPromptTitles.includes(item.title)) {
      userPresets.prompts.push(item);
      promptCount++;
    }
  });

  var userPersonas = userPresets.personas;

  var userPersonaTitles = [];
  userPersonas.forEach(function (item) {
    userPersonaTitles.push(item.title);
  });

  presets.personas.forEach(function (item) {
    if (!userPersonaTitles.includes(item.title)) {
      userPresets.personas.push(item);
      personaCount++;
    }
  });

  File.writeJSON(userPresets, userPresetsPath);

  LaunchBar.displayNotification({
    title: 'Done!',
    string: personaCount + ' new personas. ' + promptCount + ' new prompts.',
  });

  return settings();
}

function resetPresets() {
  File.writeJSON(presets, userPresetsPath);
  return settings();
}

function setApiKey() {
  // API Key dialog
  const response = LaunchBar.alert(
    'API Key required'.localize(),
    '1) Press »Open OpenAI.com« to create an API Key.\n2) Press »Set API Key«'.localize(),
    'Open OpenAI.com'.localize(),
    'Set API Key'.localize(),
    'Cancel'.localize()
  );
  switch (response) {
    case 0:
      LaunchBar.openURL('https://platform.openai.com/account/api-keys');
      LaunchBar.hide();
      break;
    case 1:
      const clipboardContent = LaunchBar.getClipboardString().trim();
      const isValidAPIKey = checkAPIKey(clipboardContent);

      if (!isValidAPIKey) return;

      Action.preferences.apiKey = clipboardContent;

      LaunchBar.alert(
        'Success!'.localize(),
        'API Key set to: '.localize() + Action.preferences.apiKey
      );
      break;
    case 2:
      break;
  }
}

function checkAPIKey(apiKey) {
  if (!apiKey.startsWith('sk-')) {
    LaunchBar.alert(
      'Invalid API Key format'.localize(),
      'Make sure the API Key is the most recent item in the clipboard!'.localize()
    );
    return false;
  }

  const result = HTTP.getJSON('https://api.openai.com/v1/models', {
    headerFields: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (result.response.status === 200) return true;

  LaunchBar.alert(
    'Invalid OpenAI API Key'.localize(),
    `Error ${result.response.status}: ${result.response.localizedStatus}`
  );

  return false;
}
