export type Lang = 'en' | 'hi' | 'gu';
export type Mood = 'idle' | 'listening' | 'thinking' | 'happy' | 'talking' | 'sleeping';

/** Where a card links: a page inside the persona, or a public path such as a GRASP join link. */
export type Target = { readonly section: string } | { readonly path: string };

export interface QuizQuestion {
  readonly q: string;
  readonly options: readonly string[];
  readonly answer: number;
  readonly why: string;
}

export type Card =
  | { readonly kind: 'due'; readonly items: readonly { title: string; subject: string; due: string; to: Target; tag: string }[] }
  | { readonly kind: 'explain'; readonly topic: string; readonly steps: readonly { icon: string; text: string }[] }
  | { readonly kind: 'quiz'; readonly topic: string; readonly questions: readonly QuizQuestion[] }
  | { readonly kind: 'hint'; readonly question: string; readonly hints: readonly string[] }
  | { readonly kind: 'progress'; readonly subjects: readonly { name: string; score: number; change: number }[]; readonly weak: readonly { topic: string; to: Target }[] }
  | { readonly kind: 'day'; readonly periods: readonly { time: string; subject: string; room: string }[]; readonly bring: readonly string[] }
  | { readonly kind: 'timer'; readonly minutes: number };

export interface Reply {
  readonly text: string;
  readonly mood: Mood;
  readonly card?: Card;
  readonly chips: readonly string[];
  readonly treats?: number;
}

// Speech recognition rarely writes the nukta (ज़ comes back as ज), so it is ignored on both sides.
const plain = (text: string): string => text.normalize('NFC').replace(/\u093C/g, '');

const has = (input: string, words: readonly string[]): boolean => words.some((w) => input.includes(plain(w)));

const CHIPS: Readonly<Record<Lang, readonly string[]>> = {
  en: ["What's due?", 'Explain photosynthesis', 'Quiz me', 'Help with my homework', 'How am I doing?', "What's my day?", 'Study timer'],
  hi: ['आज क्या जमा करना है?', 'प्रकाश संश्लेषण समझाओ', 'मेरा क्विज़ लो', 'होमवर्क में मदद करो', 'मैं कैसा कर रहा हूँ?', 'आज का टाइमटेबल', 'पढ़ाई टाइमर'],
  gu: ['આજે શું જમા કરવાનું છે?', 'પ્રકાશસંશ્લેષણ સમજાવો', 'મારી ક્વિઝ લો', 'હોમવર્કમાં મદદ કરો', 'હું કેવું કરી રહ્યો છું?', 'આજનું ટાઇમટેબલ', 'ભણવાનું ટાઇમર'],
};

const t = (lang: Lang, en: string, hi: string, gu: string): string => (lang === 'hi' ? hi : lang === 'gu' ? gu : en);

const PHOTOSYNTHESIS: readonly QuizQuestion[] = [
  { q: 'Which gas does a leaf take in to make food?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen'], answer: 1, why: 'Leaves breathe in carbon dioxide through tiny pores called stomata.' },
  { q: 'What does chlorophyll do?', options: ['Traps sunlight', 'Stores water', 'Makes roots grow'], answer: 0, why: 'Chlorophyll is the green pigment that catches light energy.' },
  { q: 'What does the plant give out?', options: ['Carbon dioxide', 'Oxygen', 'Salt'], answer: 1, why: 'Oxygen is released, which is the air we breathe!' },
];

const QUADRATIC: readonly QuizQuestion[] = [
  { q: 'If b² − 4ac is negative, the roots are…', options: ['Two real roots', 'Not real', 'Equal'], answer: 1, why: 'A negative discriminant means no real roots.' },
  { q: 'To complete the square of x² + 6x, you add…', options: ['6', '9', '36'], answer: 1, why: 'Half of 6 is 3, and 3² is 9.' },
  { q: 'A length came out as −8. You should…', options: ['Keep it', 'Reject it', 'Double it'], answer: 1, why: 'A length can never be negative, so reject it.' },
];

export function reply(raw: string, lang: Lang): Reply {
  const input = plain(raw.toLowerCase());
  const chips = CHIPS[lang];

  if (has(input, ['due', 'homework due', 'pending', 'jama', 'जमा', 'बाकी', 'kya karna', 'જમા', 'બાકી'])) {
    return {
      text: t(lang, 'You have 3 things coming up, Aarav. The Science one is a GRASP check, so read your own answer before you hand it in!', 'आरव, तुम्हारे 3 काम बाकी हैं। साइंस वाला GRASP चेक है, तो जमा करने से पहले अपना जवाब ध्यान से पढ़ लेना!', 'આરવ, તારે 3 કામ બાકી છે. સાયન્સ વાળું GRASP ચેક છે, એટલે જમા કરતાં પહેલાં તારો જવાબ ધ્યાનથી વાંચી લેજે!'),
      mood: 'talking',
      chips,
      card: {
        kind: 'due',
        items: [
          { title: 'Life Processes: nutrition and respiration', subject: 'Science', due: 'Today, 8 pm', to: { path: '/g/418207' }, tag: 'GRASP' },
          { title: 'Quadratic equations: problem set', subject: 'Maths', due: 'Tomorrow', to: { path: '/g/730962' }, tag: 'GRASP' },
          { title: 'Map work: Nationalism in India', subject: 'Social Science', due: 'Friday', to: { section: 'assignments' }, tag: 'Assignment' },
        ],
      },
    };
  }

  if (has(input, ['quiz', 'test me', 'sawal', 'सवाल', 'क्विज़', 'क्वीज', 'क्विस', 'टेस्ट', 'परीक्षा', 'प्रश्न', 'ક્વિઝ', 'સવાલ', 'પ્રશ્ન'])) {
    const maths = has(input, ['math', 'quadratic', 'गणित', 'ગણિત']);
    return {
      text: t(lang, maths ? 'Maths quiz time! Three quick ones on quadratics. Paws ready?' : 'Quiz time! Three quick ones on photosynthesis. Paws ready?', maths ? 'गणित क्विज़! द्विघात समीकरण पर तीन सवाल। तैयार?' : 'क्विज़ का समय! प्रकाश संश्लेषण पर तीन छोटे सवाल। तैयार?', maths ? 'ગણિત ક્વિઝ! દ્વિઘાત સમીકરણ પર ત્રણ સવાલ. તૈયાર?' : 'ક્વિઝનો સમય! પ્રકાશસંશ્લેષણ પર ત્રણ નાના સવાલ. તૈયાર?'),
      mood: 'happy',
      chips,
      card: { kind: 'quiz', topic: maths ? 'Quadratic equations' : 'Photosynthesis', questions: maths ? QUADRATIC : PHOTOSYNTHESIS },
    };
  }

  if (has(input, ['explain', 'samjha', 'समझा', 'what is', 'kya hai', 'क्या है', 'photosynthesis', 'प्रकाश', 'સમજાવ', 'શું છે', 'પ્રકાશ'])) {
    if (has(input, ['respiration', 'श्वसन', 'શ્વસન'])) {
      return {
        text: t(lang, 'Respiration is how your body gets energy from food. Think of it like a tiny campfire inside every cell!', 'श्वसन वह तरीका है जिससे शरीर खाने से ऊर्जा लेता है। जैसे हर कोशिका में एक छोटा सा अलाव जल रहा हो!', 'શ્વસન એ રીત છે જેનાથી શરીર ખોરાકમાંથી ઊર્જા મેળવે છે. જાણે દરેક કોષમાં એક નાનું તાપણું સળગતું હોય!'),
        mood: 'talking',
        chips,
        card: { kind: 'explain', topic: 'Respiration', steps: [
          { icon: '🍎', text: 'Food is broken down into glucose.' },
          { icon: '🫁', text: 'With oxygen (aerobic), glucose burns fully and gives lots of energy.' },
          { icon: '🏃', text: 'Without oxygen (anaerobic), you get less energy, like tired muscles making lactic acid.' },
          { icon: '🍞', text: 'Yeast does it too, and makes ethanol and the bubbles in bread!' },
        ] },
      };
    }
    return {
      text: t(lang, "Photosynthesis is how a plant makes its own food. It's like a leaf running a tiny solar-powered kitchen!", 'प्रकाश संश्लेषण वह तरीका है जिससे पौधा अपना खाना खुद बनाता है। जैसे पत्ती में सूरज से चलने वाली छोटी सी रसोई हो!', 'પ્રકાશસંશ્લેષણ એ રીત છે જેનાથી છોડ પોતાનો ખોરાક જાતે બનાવે છે. જાણે પાંદડામાં સૂરજથી ચાલતું નાનું રસોડું હોય!'),
      mood: 'talking',
      chips: [t(lang, 'Quiz me', 'मेरा क्विज़ लो', 'મારી ક્વિઝ લો'), ...chips.filter((c) => c !== t(lang, 'Quiz me', 'मेरा क्विज़ लो', 'મારી ક્વિઝ લો'))],
      treats: 1,
      card: { kind: 'explain', topic: 'Photosynthesis', steps: [
        { icon: '☀️', text: 'Sunlight lands on the leaf. Green chlorophyll catches its energy.' },
        { icon: '💧', text: 'Roots pull up water from the soil.' },
        { icon: '🌬️', text: 'Tiny pores called stomata breathe in carbon dioxide.' },
        { icon: '🍬', text: 'Using the sun’s energy, the leaf turns them into glucose, its food.' },
        { icon: '🫧', text: 'Oxygen is let out. That’s the air we breathe!' },
      ] },
    };
  }

  if (has(input, ['hint', 'help with', 'stuck', 'madad', 'मदद', 'homework', 'મદદ', 'હોમવર્ક'])) {
    return {
      text: t(lang, "I won't give you the answer, but I'll walk with you. Try one hint at a time!", 'मैं जवाब नहीं बताऊँगा, पर साथ चलूँगा। एक-एक हिंट लेकर कोशिश करो!', 'હું જવાબ નહીં કહું, પણ તારી સાથે ચાલીશ. એક પછી એક હિન્ટ લઈને પ્રયત્ન કર!'),
      mood: 'thinking',
      chips,
      card: { kind: 'hint', question: 'Q2. Distinguish between aerobic and anaerobic respiration. Give one example of each.', hints: [
        'What is the one thing aerobic respiration needs that anaerobic does not?',
        'Which one gives your body more energy? Think about a long, easy jog.',
        'When you sprint very hard, your legs ache. What builds up in the muscles?',
        'Now write two lines: what each one needs, and one example of each.',
      ] },
    };
  }

  if (has(input, ['how am i', 'progress', 'marks', 'score', 'doing', 'कैसा', 'नंबर', 'કેવું', 'ગુણ', 'માર્ક્સ'])) {
    return {
      text: t(lang, "You're doing great, Aarav! Maths is up 6 points. Respiration still trips you up a little, so let's practise it.", 'तुम बढ़िया कर रहे हो, आरव! गणित में 6 अंक बढ़े हैं। श्वसन थोड़ा कमज़ोर है, चलो उसका अभ्यास करें।', 'તું સરસ કરી રહ્યો છે, આરવ! ગણિતમાં 6 ગુણ વધ્યા છે. શ્વસન થોડું નબળું છે, ચાલ તેની પ્રેક્ટિસ કરીએ.'),
      mood: 'happy',
      chips,
      card: {
        kind: 'progress',
        subjects: [
          { name: 'Maths', score: 84, change: 6 },
          { name: 'Science', score: 78, change: 2 },
          { name: 'Social Science', score: 81, change: -1 },
          { name: 'English', score: 88, change: 3 },
        ],
        weak: [
          { topic: 'Aerobic vs anaerobic respiration', to: { section: 'learning/flashcards' } },
          { topic: 'Completing the square', to: { section: 'learning/gaps' } },
        ],
      },
    };
  }

  if (has(input, ['today', 'timetable', 'my day', 'schedule', 'aaj', 'आज', 'टाइमटेबल', 'આજ', 'ટાઇમટેબલ'])) {
    return {
      text: t(lang, 'Here’s your day! Lab after lunch, so don’t forget your lab coat.', 'यह रहा तुम्हारा दिन! लंच के बाद लैब है, लैब कोट मत भूलना।', 'આ રહ્યો તારો દિવસ! લંચ પછી લેબ છે, લેબ કોટ ભૂલતો નહીં.'),
      mood: 'talking',
      chips,
      card: {
        kind: 'day',
        periods: [
          { time: '8:00', subject: 'Maths', room: '10A' },
          { time: '8:45', subject: 'Science', room: '10A' },
          { time: '9:30', subject: 'English', room: '10A' },
          { time: '11:00', subject: 'Social Science', room: '10A' },
          { time: '12:30', subject: 'Science Lab', room: 'Bio Lab' },
        ],
        bring: ['Lab coat', 'Geometry box', 'Science notebook'],
      },
    };
  }

  if (has(input, ['timer', 'focus', 'study', 'padh', 'पढ़ाई', 'pomodoro', 'ભણવાનું', 'ટાઇમર'])) {
    return {
      text: t(lang, "Let's focus for 10 minutes. I'll take a nap and wake you when it's break time!", 'चलो 10 मिनट ध्यान से पढ़ते हैं। मैं झपकी लूँगा और ब्रेक पर तुम्हें जगाऊँगा!', 'ચાલ 10 મિનિટ ધ્યાનથી ભણીએ. હું ઝોકું ખાઈશ અને બ્રેક વખતે તને જગાડીશ!'),
      mood: 'happy',
      chips,
      card: { kind: 'timer', minutes: 10 },
    };
  }

  if (has(input, ['thank', 'shukriya', 'धन्यवाद', 'शुक्रिया', 'આભાર', 'થેંક'])) {
    return { text: t(lang, 'Anytime! Woof! 🐾', 'कभी भी! 🐾', 'ગમે ત્યારે! 🐾'), mood: 'happy', chips, treats: 1 };
  }

  if (has(input, ['joke', 'funny', 'मज़ाक', 'चुटकुला', 'જોક', 'મજાક'])) {
    return { text: t(lang, 'Why did the student eat his homework? Because the teacher said it was a piece of cake! 🍰', 'छात्र ने होमवर्क क्यों खा लिया? क्योंकि टीचर ने कहा था यह तो बाएँ हाथ का खेल है! 😄', 'વિદ્યાર્થીએ હોમવર્ક કેમ ખાઈ લીધું? કારણ કે ટીચરે કહ્યું હતું કે આ તો ડાબા હાથનો ખેલ છે! 😄'), mood: 'happy', chips };
  }

  if (/\b(hi+|hello+|helo|hallo|hullo|hey|hiya|namaste|namaskar|good (morning|afternoon|evening)|jerry|jery|jerri)\b/.test(input) || has(input, ['नमस्ते', 'नमस्कार', 'हेलो', 'हैलो', 'हलो', 'हाय', 'जैरी', 'जेरी', 'सुप्रभात', 'નમસ્તે', 'હેલો', 'હાય', 'જેરી', 'કેમ છો', 'સુપ્રભાત'])) {
    return { text: t(lang, "Woof! Hi Aarav! I'm Jerry, your study buddy. What shall we do today?", 'नमस्ते आरव! मैं जैरी हूँ, तुम्हारा पढ़ाई का दोस्त। आज क्या करें?', 'નમસ્તે આરવ! હું જેરી છું, તારો ભણવાનો દોસ્ત. આજે શું કરીએ?'), mood: 'happy', chips };
  }

  return {
    text: t(lang, "Hmm, I'm still learning that trick! I can tell you what's due, explain a topic, quiz you, give homework hints, or plan your day.", 'हम्म, यह ट्रिक मैं अभी सीख रहा हूँ! मैं बता सकता हूँ क्या जमा करना है, कोई टॉपिक समझा सकता हूँ, क्विज़ ले सकता हूँ, या दिन की योजना बना सकता हूँ।', 'હમ્મ, આ યુક્તિ હું હજી શીખી રહ્યો છું! હું કહી શકું કે શું જમા કરવાનું છે, કોઈ ટોપિક સમજાવી શકું, ક્વિઝ લઈ શકું, કે દિવસનું આયોજન કરી શકું.'),
    mood: 'thinking',
    chips,
  };
}

export const greeting = (lang: Lang): Reply => reply('hello', lang);
