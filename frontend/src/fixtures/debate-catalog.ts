import type { DebateCatalog } from '@/types/debate';

export const DEBATE_CATALOG: DebateCatalog = {
  categories: [
    {
      id: 'technology',
      label: 'Technology',
      topics: [
        { id: 'technology-2', text: 'Should social media platforms be responsible for misinformation?' },
        { id: 'technology-3', text: 'Should children under 13 be allowed to own smartphones?' },
        { id: 'technology-4', text: 'Is artificial intelligence more helpful than harmful?' },
        { id: 'technology-5', text: 'Should competitive video games be recognised as a sport?' },
      ],
    },
    {
      id: 'education',
      label: 'Education',
      topics: [
        { id: 'education-1', text: 'Should homework be abolished?' },
        { id: 'education-2', text: 'Should school uniforms be mandatory?' },
        { id: 'education-3', text: 'Is online education better than classroom education?' },
        { id: 'education-4', text: 'Should school start later in the morning?' },
        { id: 'education-5', text: 'Should exams be replaced by project-based assessment?' },
      ],
    },
    {
      id: 'society',
      label: 'Society',
      topics: [
        { id: 'society-1', text: 'Is social media beneficial for teenagers?' },
        { id: 'society-2', text: 'Should voting be compulsory?' },
        { id: 'society-3', text: 'Should celebrities be expected to act as role models?' },
        { id: 'society-4', text: 'Is it better to grow up in a city than in a village?' },
        { id: 'society-5', text: 'Should public transport be free for everyone?' },
      ],
    },
    {
      id: 'science',
      label: 'Science',
      topics: [
        { id: 'science-1', text: 'Is space exploration worth the cost?' },
        { id: 'science-2', text: 'Should humans colonize Mars?' },
        { id: 'science-3', text: 'Should genetically modified crops be encouraged?' },
        { id: 'science-4', text: 'Should animal testing be banned?' },
        { id: 'science-5', text: 'Is nuclear energy the best answer to climate change?' },
      ],
    },
    {
      id: 'environment',
      label: 'Environment',
      topics: [
        { id: 'environment-1', text: 'Should single-use plastics be banned completely?' },
        { id: 'environment-2', text: 'Should private cars be banned from city centres?' },
        { id: 'environment-3', text: 'Is individual action enough to fight climate change?' },
        { id: 'environment-4', text: 'Should zoos be closed?' },
        { id: 'environment-5', text: 'Should developing countries put economic growth before environmental protection?' },
      ],
    },
    {
      id: 'ethics',
      label: 'Ethics',
      topics: [
        { id: 'ethics-1', text: 'Is it ever right to break the law?' },
        { id: 'ethics-2', text: 'Is it ethical to eat meat?' },
        { id: 'ethics-3', text: 'Should AI-generated art be considered real art?' },
        { id: 'ethics-4', text: 'Should people be allowed to sell their own organs?' },
        { id: 'ethics-5', text: "Is it acceptable to lie to protect someone's feelings?" },
      ],
    },
    {
      id: 'civics',
      label: 'Civics',
      topics: [
        { id: 'civics-1', text: 'Should the voting age be lowered to 16?' },
        { id: 'civics-2', text: 'Should citizens be allowed to vote online?' },
        { id: 'civics-3', text: 'Should military service be compulsory?' },
        { id: 'civics-4', text: 'Should elected politicians have term limits?' },
        { id: 'civics-5', text: 'Should governments be allowed to block websites?' },
      ],
    },
    {
      id: 'business',
      label: 'Business',
      topics: [
        { id: 'business-1', text: 'Should companies adopt a four-day work week?' },
        { id: 'business-2', text: 'Is a cashless society a good idea?' },
        { id: 'business-3', text: 'Should advertising aimed at children be banned?' },
        { id: 'business-4', text: 'Do the benefits of globalisation outweigh the costs?' },
        { id: 'business-5', text: 'Should large companies pay for the plastic waste they create?' },
      ],
    },
    {
      id: 'future',
      label: 'Future',
      topics: [
        { id: 'future-1', text: 'Will robots create more jobs than they destroy?' },
        { id: 'future-2', text: 'Should self-driving cars replace human drivers?' },
        { id: 'future-3', text: 'Should governments introduce a universal basic income?' },
        { id: 'future-4', text: 'Should humans try to extend their lifespan indefinitely?' },
        { id: 'future-5', text: 'Will cities of the future be better without cars?' },
      ],
    },
    {
      id: 'everyday',
      label: 'Everyday Life',
      topics: [
        { id: 'everyday-1', text: 'Is it better to be a morning person than a night owl?' },
        { id: 'everyday-2', text: 'Should pets be allowed in classrooms?' },
        { id: 'everyday-3', text: 'Is reading a book better than watching its film?' },
        { id: 'everyday-4', text: 'Should junk food be taxed?' },
        { id: 'everyday-5', text: 'Is homeschooling better than attending school?' },
      ],
    },
  ],
  positions: [
    { id: 'FOR', label: 'For', description: 'Argue in favour of the motion.' },
    { id: 'AGAINST', label: 'Against', description: 'Argue against the motion.' },
    { id: 'AUTO', label: 'Let AI choose my side', description: 'Your side is assigned at random and shown before you begin.' },
  ],
  first_speakers: [
    { id: 'student', label: 'Me', description: 'You open the debate.' },
    { id: 'ai', label: 'AI', description: 'Your opponent opens; you respond.' },
  ],
  difficulties: [
    { id: 'beginner', label: 'Beginner', summary: 'Clear arguments, moderate questions, gentler counterarguments.' },
    { id: 'intermediate', label: 'Intermediate', summary: 'Strong counterarguments, follow-up questions, basic logical challenges.' },
    { id: 'advanced', label: 'Advanced', summary: 'Complex reasoning, contradiction detection, evidence challenges.' },
    { id: 'expert', label: 'Expert', summary: 'A very strong opponent: Socratic questioning, assumption testing, fallacy detection.' },
  ],
  languages: [
    { code: 'en-IN', name: 'English', native: 'English' },
    { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी' },
    { code: 'bn-IN', name: 'Bengali', native: 'বাংলা' },
    { code: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml-IN', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'mr-IN', name: 'Marathi', native: 'मराठी' },
    { code: 'od-IN', name: 'Odia', native: 'ଓଡ଼ିଆ' },
    { code: 'pa-IN', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்' },
    { code: 'te-IN', name: 'Telugu', native: 'తెలుగు' },
  ],
  durations: [
    { seconds: 180, label: '3 minutes' },
    { seconds: 300, label: '5 minutes' },
    { seconds: 420, label: '7 minutes' },
    { seconds: 600, label: '10 minutes' },
  ],
  limits: { max_duration_s: 600, topic_min_chars: 8, topic_max_chars: 200, context_max_chars: 400 },
  voice: { capture_sample_rate: 16000, max_segment_s: 29.5, max_student_turn_s: 240 },
};
