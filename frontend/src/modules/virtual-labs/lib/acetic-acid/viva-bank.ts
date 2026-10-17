import type { BenchVivaQuestion } from '@labs/types/lab-bench';

/**
 * THE VIVA BANK for this practical — 15 questions across 5 categories.
 *
 * Five are drawn per attempt, one from each category where the bank allows,
 * with the options shuffled and the correct answer carried by identity. See
 * `@labs/lib/viva.ts`; never read this list to mark an answer.
 *
 * The questions and their explanations are the reference bench's own words,
 * carried over verbatim.
 */
export const VIVA_BANK: readonly BenchVivaQuestion[] = [
  {
    cat: 'principle',
    q: 'Acetic acid is called a **weak** acid. What does that actually mean?',
    a: 2,
    o: [
      'It is always kept dilute, and is never sold or used at full strength',
      'It contains fewer hydrogen atoms per molecule than hydrochloric acid does',
      'Only a small fraction of its molecules ionise in water, so the same concentration gives far fewer H⁺ ions and a higher pH',
      'It will react with weak bases only, and leaves strong bases untouched',
    ],
    why: 'Strength is about how completely an acid ionises, not how concentrated it is. 0.1 M HCl ionises fully and reads pH 1; 0.1 M acetic acid barely ionises and reads about 3.',
  },
  {
    cat: 'principle',
    q: 'Effervescence with sodium hydrogen carbonate is a standard test for…',
    a: 1,
    o: [
      'any liquid at all',
      'an acid',
      'a base',
      'an alcohol',
    ],
    why: 'Carbonates and hydrogencarbonates give CO₂ with acids and with nothing else on the bench. Fizzing with NaHCO₃ is therefore a test for the acidic nature of a substance.',
  },
  {
    cat: 'principle',
    q: 'Ethanoic acid mixes with water in every proportion; vegetable oil does not. The reason is that…',
    a: 0,
    o: [
      'the –COOH end of the acid is lopsided and bonds to water as water bonds to water',
      'the acid is lighter than water and the oil is heavier, so the oil sinks away',
      'the acid is acidic and water is neutral, and opposites attract one another',
      'oil molecules are simply too large to fit in between the water molecules',
    ],
    why: 'Water clings to water. Something dissolves in it only if it can offer bonds of the same kind in exchange for those it breaks, and a hydrocarbon chain carrying no charge anywhere along it has nothing to offer.',
  },
  {
    cat: 'apparatus',
    q: 'Tube 6 holds dilute hydrochloric acid at the **same** concentration as the acetic acid. What is it there for?',
    a: 0,
    o: [
      'As a reference: a fully ionised acid at that concentration, to read the weak one against',
      'To be mixed into the acetic acid so that the reaction with the solid runs faster',
      'As a spare acid, in case the bottle of acetic acid should run out part way',
      'To rinse the litmus strips between one tube of the rack and the next',
    ],
    why: 'Strength only means anything as a comparison. Two acids at one concentration, one fully ionised and one barely, is what turns the word "weak" into a number you can read off the paper.',
  },
  {
    cat: 'apparatus',
    q: 'The far end of the delivery tube is pushed **under** the surface of the lime water rather than held above it. Why?',
    a: 0,
    o: [
      'Every bubble must then pass through the liquid, where the gas can react instead of drifting off',
      'It stops the lime water being sucked back into the tube making the gas',
      'It cools the gas on its way through, which the test needs in order to work',
      'It keeps the lime water stirred, which is what makes a precipitate appear',
    ],
    why: 'The test works only if the gas meets the calcium hydroxide. Held above the surface, most of it escapes into the room and the lime water can stay clear even though carbon dioxide was certainly made.',
  },
  {
    cat: 'apparatus',
    q: 'The bench carries both litmus paper and pH paper. Why is it worth using both on the same tube?',
    a: 0,
    o: [
      'Litmus answers whether it is an acid at all; pH paper says roughly how much H⁺ is there',
      'pH paper is the substitute used only when the litmus papers have run out',
      'Litmus works on solids and pH paper only on liquids, so both are kept ready',
      'Two papers are used so that an average of the two colours can be taken',
    ],
    why: 'Litmus is a yes-or-no indicator with a single change of colour. Separating a weak acid from a strong one needs a reading on a scale, and that is what the universal-indicator ramp of pH paper gives.',
  },
  {
    cat: 'procedure',
    q: 'What is the correct way to find out how a chemical in a test tube smells?',
    a: 1,
    o: [
      'Put your nose over the mouth of the tube and breathe steadily in',
      'Hold the tube away from you and waft the vapour towards your nose with your hand',
      'Warm the tube first, so that more of the vapour comes off it',
      'Pour a little of it onto the back of your hand and smell that instead',
    ],
    why: 'Wafting brings a trace of vapour to you. Putting your nose to the tube means a full lungful of whatever is in there, which with a concentrated acid can burn the airway.',
  },
  {
    cat: 'procedure',
    q: 'A **fresh** strip of litmus is used for each test rather than the same strip twice. Why does that matter?',
    a: 0,
    o: [
      'A used strip carries liquid and dye from the first tube, so the second reading is not that tube’s own',
      'Litmus paper changes colour once only and will not respond a second time',
      'A strip that has been dipped becomes too wet to hold steady in the forceps',
      'One strip used twice would consume twice as much of the dye it carries',
    ],
    why: 'Carry-over is the classic indicator error. A strip wet with acid reads acidic wherever it goes next, and the second tube is then reporting the first one.',
  },
  {
    cat: 'procedure',
    q: 'Why is the delivery tube fitted to the acid tube **before** the spatula of sodium hydrogen carbonate goes in?',
    a: 0,
    o: [
      'The reaction is fastest at the very start, so any gas made before it is connected is lost',
      'The solid will not dissolve at all unless the tube has been corked first',
      'The cork is what stops the acid evaporating away out of the open tube',
      'Fitting it afterwards would let lime water run back down into the acid',
    ],
    why: 'The rate depends on how much H⁺ is loose in the tube, so it peaks the instant the solid lands and falls away from there. Connect it afterwards and the strongest burst of gas has already gone into the room.',
  },
  {
    cat: 'errors',
    q: 'Gas is passed through lime water that has stood open on the bench for weeks, and it hardly clouds. The likeliest reason is…',
    a: 0,
    o: [
      'the lime water had already taken up carbon dioxide from the air, leaving little Ca(OH)₂',
      'lime water simply stops working a day after it is made, for no particular reason',
      'the gas coming off the tube was not carbon dioxide after all, but something else',
      'the reagent only responds when it is warm, and a standing bottle has gone cold',
    ],
    why: 'Lime water is a solution of calcium hydroxide, and the air is full of carbon dioxide. An open bottle turns slowly to chalk, and the test then fails on a gas that would have passed it easily.',
  },
  {
    cat: 'errors',
    q: 'A tube is shaken and looks cloudy right through. A student writes down “two layers”. What has gone wrong?',
    a: 0,
    o: [
      'Cloudiness while shaking is a passing emulsion; the observation is what the tube settles into',
      'Nothing has gone wrong — a cloudy tube is what two layers always look like',
      'The tube was shaken too gently, so nothing in it was really mixed at all',
      'The cloudiness proves that the two liquids have reacted with one another',
    ],
    why: 'Shaking forces almost any pair of liquids into fine droplets for a moment. Solubility is read after standing: one clear layer with no boundary in it, or two layers with a sharp one.',
  },
  {
    cat: 'errors',
    q: 'Which of these would make the comparison between the odour of tube 1 and tube 2 meaningless?',
    a: 0,
    o: [
      'Wafting the second tube while the vapour of the first was still hanging around your face',
      'Holding each of the two tubes at about the same distance away from your face',
      'Using the same hand to fan the vapour from each of the two tubes in turn',
      'Smelling the two tubes within a minute or so of one another',
    ],
    why: 'The comparison is between a sample and its own dilution, and it turns on a faint difference. Vapour left over from the stronger tube swamps that difference, so the tubes must be wafted cleanly and with a pause between them.',
  },
  {
    cat: 'interpretation',
    q: 'A gas comes off when NaHCO₃ meets the acid. Which **pair** of results would identify it?',
    a: 3,
    o: [
      'It is colourless, and it has no smell of its own at all',
      'It burns with a blue flame, and it pops when a flame is put to it',
      'It relights a glowing splinter, and it has a sharp smell',
      'It turns lime water milky, and it puts out a burning splinter',
    ],
    why: 'The two together name carbon dioxide: the milkiness is calcium carbonate, and CO₂ does not support combustion, so the splinter goes out. Either result on its own is weaker evidence.',
  },
  {
    cat: 'interpretation',
    q: 'Why is the vinegar smell of the acid worth recording as an observation at all?',
    a: 0,
    o: [
      'It is a physical property that helps identify ethanoic acid — vinegar is 5–8% of it',
      'Because the strength of the smell is a measure of how strong an acid it is',
      'Because every acid on the bench smells the same, so it confirms the class',
      'Because the sharpness of the smell gives the pH of the tube to within a unit',
    ],
    why: 'Smell is a property of the substance, not of its acidity. The dilute HCl in the same rack has no such smell at all, and the sharp vinegar odour is a real clue to what this one is.',
  },
  {
    cat: 'interpretation',
    q: 'The fizzing in the acid tube dies away while solid can still be seen at the bottom. What does that tell you?',
    a: 0,
    o: [
      'The acid has been used up: the reaction stops when either reagent runs out, and here it was the acid',
      'The sodium hydrogen carbonate at the bottom has stopped being a hydrogencarbonate',
      'The gas has all dissolved back into the liquid standing above the solid',
      'The tube has cooled below the temperature at which the reaction will run',
    ],
    why: 'One spatula of the solid holds more hydrogencarbonate than a few millilitres of a dilute acid can supply H⁺ for. Solid left at the end is the sign that the acid was the limiting reagent.',
  },
];
