'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Mic, Send, Square, Volume2, VolumeX } from 'lucide-react';

import { Segmented } from '@/components/ui/segmented';
import { type Card as JerryCardData, greeting, type Lang, type Mood, reply, type Reply } from '@/lib/jerry/brain';

import { Confetti } from './confetti';
import { JerryCard } from './jerry-cards';
import { JerryDog } from './jerry-dog';
import { useVoice } from './use-voice';

interface Message {
  id: number;
  from: 'jerry' | 'kid';
  text: string;
  card?: JerryCardData;
}

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(181, 83, 94, 0.5); }
  100% { box-shadow: 0 0 0 16px rgba(181, 83, 94, 0); }
`;

const MOOD_LINE: Readonly<Record<Mood, string>> = {
  idle: 'Ready when you are',
  listening: 'Listening…',
  thinking: 'Thinking…',
  happy: 'So happy!',
  talking: 'Talking…',
  sleeping: 'Napping while you focus',
};

let nextId = 0;

const say = (lang: Lang, en: string, hi: string, gu: string): string => (lang === 'hi' ? hi : lang === 'gu' ? gu : en);

export function JerryBuddy({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const [lang, setLang] = React.useState<Lang>('en');
  const [messages, setMessages] = React.useState<Message[]>(() => [{ id: (nextId += 1), from: 'jerry', text: greeting('en').text }]);
  const [chips, setChips] = React.useState<readonly string[]>(greeting('en').chips);
  const [mood, setMood] = React.useState<Mood>('idle');
  const [typing, setTyping] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [treats, setTreats] = React.useState(3);
  const [party, setParty] = React.useState(0);
  const [sound, setSound] = React.useState(true);
  const busy = React.useRef(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const voice = useVoice(lang);


  const typeOut = (answer: Reply): void => {
    let shown = 0;
    const settle = answer.mood === 'talking' ? 'idle' : answer.mood;
    setMood('talking');
    if (sound) voice.speak(answer.text, () => setMood('talking'), () => setMood((m) => (m === 'talking' ? settle : m)));
    const step = (): void => {
      shown = Math.min(answer.text.length, shown + 3);
      setTyping(answer.text.slice(0, shown));
      if (shown < answer.text.length) {
        setTimeout(step, 18);
        return;
      }
      setTyping('');
      setMessages((m) => [...m, { id: (nextId += 1), from: 'jerry', text: answer.text, card: answer.card }]);
      setChips(answer.chips);
      if (answer.treats) setTreats((n) => n + (answer.treats ?? 0));
      setMood(settle);
      busy.current = false;
    };
    step();
  };

  const ask = (text: string): void => {
    if (!text.trim() || busy.current) return;
    busy.current = true;
    setDraft('');
    setMessages((m) => [...m, { id: (nextId += 1), from: 'kid', text }]);
    setMood('thinking');
    const answer: Reply = reply(text, lang);
    setTimeout(() => typeOut(answer), 650);
  };

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const celebrate = React.useCallback((score: number, total: number) => {
    setTreats((n) => n + score);
    if (score === total) {
      setParty((p) => p + 1);
      setMood('happy');
    }
  }, []);

  const switchLang = (next: Lang): void => {
    voice.stop();
    setLang(next);
    const hello = greeting(next);
    setChips(hello.chips);
    setMessages((m) => [...m, { id: (nextId += 1), from: 'jerry', text: hello.text }]);
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '380px minmax(0, 1fr)' }, gap: 3, alignItems: 'stretch' }}>
      <Card sx={(t) => ({ position: 'relative', overflow: 'hidden', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', background: `radial-gradient(circle at 50% 38%, ${t.tints.amber} 0%, ${t.brand.surface} 68%)` })}>
        {party > 0 ? <Confetti key={party} /> : null}
        <Stack direction="row" sx={{ alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
          <Segmented<Lang> ariaLabel="Language" value={lang} onChange={switchLang} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }, { value: 'gu', label: 'ગુજરાતી' }]} />
          <Tooltip title={sound ? 'Mute Jerry' : 'Let Jerry speak'}>
            <IconButton onClick={() => (setSound(!sound), voice.stop())} aria-label="Jerry's voice">
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </IconButton>
          </Tooltip>
        </Stack>
        <Box sx={{ my: 2 }}>
          <JerryDog mood={voice.listening ? 'listening' : mood} size={260} />
        </Box>
        <Typography variant="h3" component="h2">
          Jerry
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {MOOD_LINE[voice.listening ? 'listening' : mood]}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2.5, alignSelf: 'stretch', justifyContent: 'center' }}>
          <Box sx={(t) => ({ px: 2, py: 1, borderRadius: `${t.band.radius.md}px`, bgcolor: t.brand.canvas, textAlign: 'center' })}>
            <Typography sx={{ fontSize: 22, fontWeight: 800 }}>🦴 {treats}</Typography>
            <Typography variant="caption" color="text.secondary">
              treats earned
            </Typography>
          </Box>
          <Box sx={(t) => ({ px: 2, py: 1, borderRadius: `${t.band.radius.md}px`, bgcolor: t.brand.canvas, textAlign: 'center' })}>
            <Typography sx={{ fontSize: 22, fontWeight: 800 }}>🔥 4</Typography>
            <Typography variant="caption" color="text.secondary">
              day streak
            </Typography>
          </Box>
        </Stack>
        {voice.speaking || voice.listening ? (
          <IconButton
            onClick={voice.stop}
            aria-label="Stop Jerry"
            sx={(t) => ({ mt: 3, width: 72, height: 72, bgcolor: t.brand.ink, color: t.palette.common.white, '&:hover': { bgcolor: t.brand.ink }, animation: `${pulse} 1s ease-out infinite` })}
          >
            <Square size={26} fill="currentColor" />
          </IconButton>
        ) : (
          <Tooltip title={say(lang, 'Talk to Jerry', 'हिंदी में बोलो', 'ગુજરાતીમાં બોલો')}>
            <span>
              <IconButton
                onClick={() => voice.listen(ask)}
                aria-label="Talk to Jerry"
                sx={(t) => ({ mt: 3, width: 72, height: 72, bgcolor: t.palette.primary.main, color: t.palette.primary.contrastText, '&:hover': { bgcolor: t.palette.primary.dark } })}
              >
                <Mic size={30} />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {voice.listening && voice.heard ? (
          <Box sx={(t) => ({ mt: 1.5, px: 1.75, py: 1, borderRadius: '14px', bgcolor: t.brand.canvas, border: `1px dashed ${t.brand.line2}`, maxWidth: 300, textAlign: 'center' })}>
            <Typography variant="body2">“{voice.heard}”</Typography>
          </Box>
        ) : null}
        {lang === 'gu' && sound && !voice.canSpeak('gu') ? (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, maxWidth: 300, textAlign: 'center' }}>
            આ બ્રાઉઝરમાં ગુજરાતી અવાજ નથી, એટલે જેરી લખીને જવાબ આપશે. (No Gujarati voice in this browser, so Jerry replies in text.)
          </Typography>
        ) : null}
        {voice.problem && !voice.listening ? (
          <Alert severity="warning" sx={{ mt: 1.5, maxWidth: 320 }}>
            {voice.problem}
          </Alert>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
          {voice.speaking
            ? say(lang, 'Tap to stop Jerry talking (or press Esc)', 'रोकने के लिए दबाओ (या Esc)', 'રોકવા માટે દબાવો (અથવા Esc)')
            : voice.listening
              ? say(lang, 'Listening… tap to stop', 'सुन रहा हूँ… रोकने के लिए दबाओ', 'સાંભળું છું… રોકવા દબાવો')
              : say(lang, 'Tap the mic and ask anything', 'माइक दबाकर बोलो', 'માઇક દબાવીને બોલો')}
        </Typography>
      </Card>

      <Card sx={{ display: 'flex', flexDirection: 'column', height: { lg: 'calc(100vh - 210px)' }, minHeight: 560 }}>
        <Box ref={scroller} sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            {messages.map((m) => (
              <Box key={m.id} sx={{ alignSelf: m.from === 'kid' ? 'flex-end' : 'flex-start', maxWidth: m.card ? '100%' : '82%', width: m.card ? '100%' : 'auto' }}>
                <Box sx={(t) => ({ display: 'inline-block', px: 2, py: 1.25, borderRadius: '18px', borderBottomLeftRadius: m.from === 'jerry' ? '4px' : '18px', borderBottomRightRadius: m.from === 'kid' ? '4px' : '18px', bgcolor: m.from === 'kid' ? t.palette.primary.main : t.tints.amber, color: m.from === 'kid' ? t.palette.primary.contrastText : t.brand.ink })}>
                  <Typography variant="body1">{m.text}</Typography>
                </Box>
                {m.card ? <JerryCard card={m.card} slug={personaSlug} onQuizDone={celebrate} onTimerRun={() => setMood('sleeping')} onTimerDone={() => (setMood('happy'), setParty((p) => p + 1), setTreats((n) => n + 2))} /> : null}
              </Box>
            ))}
            {typing ? (
              <Box sx={(t) => ({ alignSelf: 'flex-start', maxWidth: '82%', px: 2, py: 1.25, borderRadius: '18px', borderBottomLeftRadius: '4px', bgcolor: t.tints.amber })}>
                <Typography variant="body1">{typing}▍</Typography>
              </Box>
            ) : null}
          </Stack>
        </Box>
        <Box sx={(t) => ({ borderTop: `1px solid ${t.brand.line}`, p: 2 })}>
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1.5 }}>
            {chips.map((c) => (
              <Chip key={c} label={c} onClick={() => ask(c)} variant="outlined" sx={{ flex: 'none' }} />
            ))}
          </Stack>
          <Stack component="form" direction="row" spacing={1} onSubmit={(e) => (e.preventDefault(), ask(draft))}>
            <TextField fullWidth size="small" placeholder={say(lang, 'Ask Jerry anything…', 'जैरी से कुछ भी पूछो…', 'જેરીને કંઈ પણ પૂછો…')} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <IconButton type="submit" aria-label="Send" color="primary" disabled={!draft.trim()}>
              <Send size={18} />
            </IconButton>
          </Stack>
        </Box>
      </Card>
    </Box>
  );
}
