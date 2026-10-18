/* ============================================================================
   play.js — the Playground runtime, shared by every page.

   A page holds its own model and its own art. Everything else lives here:
   the thread registry and the class ladder, the age bands, voice, sound,
   Predict -> Play -> Explain, findings, sharing a state as a link, present
   mode for a classroom screen, and the event record posted to a host LMS.

   The one rule every page obeys, inherited from lms-lab-engine: SIMULATE THE
   THING, NOT THE ANSWER. Whatever the learner sees happen, happens because the
   page's model says so for what they did — never because a clip was played.

   No modules, no build step, no dependencies. Load with a plain
   <script src="../../play.js"> before the page script. Everything is on
   window.Play.
   ========================================================================== */
(function (root) {
'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   FEATURE FLAGS — administrator side. Turning one off removes the feature.
     window.PLAY_FEATURES = {voice:false}  before this script
     ?ff=voice:0,predict:0                 query string
     postMessage({type:'playground:features', features:{...}}, '*')
   ─────────────────────────────────────────────────────────────────────────── */
const FEATURE_DEFAULTS = {
  voice:     true,   // read-aloud (on by default only for the young bands)
  sound:     true,   // little sound effects
  predict:   true,   // Predict -> Play -> Explain cards
  findings:  true,   // the collectable findings tray
  present:   true,   // the classroom "Present" button
  share:     true,   // "Copy link" to this exact state
  telemetry: true,   // post events to the parent frame
};
const FEATURES = Object.assign({}, FEATURE_DEFAULTS, root.PLAY_FEATURES || {});
(() => {
  const q = new URLSearchParams(location.search).get('ff');
  if (!q) return;
  for (const part of q.split(',')) {
    const [k, v] = part.split(':');
    if (k in FEATURES) FEATURES[k] = !(v === '0' || v === 'false' || v === 'off');
  }
})();
// Audio is switched off across the whole playground inside Emerge: no read-aloud, no sound effects, whatever a link or the host asks for.
const SILENT = new Set(['voice', 'sound']);
const FF = k => !SILENT.has(k) && FEATURES[k] !== false;
addEventListener('message', e => {
  const d = e && e.data;
  if (!d || d.type !== 'playground:features' || !d.features) return;
  Object.assign(FEATURES, d.features);
  if (typeof root.applyFeatures === 'function') root.applyFeatures();
});

/* ══════════════════════════════════════════════════════════════════════════
   1. Bands and threads.

   A THREAD is one idea followed through twelve years of school. Each band
   gets its own page, built for how children of that age think and play:
   the same idea, not the same page made harder.
   ══════════════════════════════════════════════════════════════════════════ */
const BANDS = [
  {id: 'tiny',     name: 'Tiny',     classes: [1, 2],     feel: 'Voice first, no reading needed. Tap, drag, spin. Nothing can go wrong.'},
  {id: 'explorer', name: 'Explorer', classes: [3, 4, 5],  feel: 'Missions and stories. Simple sliders. Collect what you find.'},
  {id: 'tinkerer', name: 'Tinkerer', classes: [6, 7, 8],  feel: 'Predict first, then play. The first graphs appear, and they move with you.'},
  {id: 'modeller', name: 'Modeller', classes: [9, 10],    feel: 'Linked views: the model, its graph and its numbers move together.'},
  {id: 'theorist', name: 'Theorist', classes: [11, 12],   feel: 'Set the law yourself. Measure it. Push it until it breaks.'},
];
const bandOf = id => BANDS.find(b => b.id === id);
const bandForClass = c => BANDS.find(b => b.classes.includes(+c));

const THREADS = [
  {id: 'sun-earth', name: 'The Sun and the Earth', subject: 'Science · Geography', hue: '#f29a1f',
   tagline: 'From “why is it night?” to Kepler’s laws.',
   steps: {
     tiny:     {title: 'Night and day',               blurb: 'Spin the Earth. Wake the rooster, put the owl to bed.'},
     explorer: {title: 'Shadows and the Moon',        blurb: 'Move the Sun across the sky, and walk the Moon around the Earth.'},
     tinkerer: {title: 'Why are there seasons?',      blurb: 'Most people think Earth is closer in summer. It isn’t.'},
     modeller: {title: 'Why is the equator hot?', blurb: 'The same sunlight, spread over a curved Earth — and the winds that carry the heat away.'},
     theorist: {title: 'Kepler, measured',            blurb: 'Equal areas in equal times. Change the law of gravity and watch orbits fall apart.'},
   }},
  {id: 'fractions', name: 'Parts of a Whole', subject: 'Mathematics', hue: '#e0567a',
   tagline: 'From sharing a roti fairly to infinitely many pieces.',
   steps: {
     tiny:     {title: 'Share it fairly',             blurb: 'Cut the roti so every friend gets the same.'},
     explorer: {title: 'The fraction wall',           blurb: 'Build one half out of quarters, and find which is bigger.',
       parts: [
         {id: null, title: "The fraction wall", blurb: "Build one half out of quarters, and find which is bigger."},
         {id: "numberline", title: "Fractions on a number line", built: false, blurb: "Every fraction has its own place between the whole numbers."},
         {id: "addsub", title: "Adding pieces of different sizes", built: false, blurb: "You cannot add a third to a quarter until both are cut the same way."},
       ],
     },
     tinkerer: {title: 'Does multiplying make bigger?', blurb: 'Half of three quarters — on an area you can see.'},
     modeller: {title: 'Decimals that never end',     blurb: 'Long division goes round a clock of remainders, and the square-root spiral measures √2, √3, √4 …'},
     theorist: {title: 'Infinitely many pieces',      blurb: 'Infinite series that fill a square, and the area under a curve that an integral measures.'},
   }},
  {id: 'words', name: 'Words and Sentences', subject: 'English', hue: '#3f7fd8',
   tagline: 'From the sounds of letters to the shape of a sentence.',
   steps: {
     tiny:     {title: 'The word train',              blurb: 'Put sounds in the carriages and hear the word come to life.'},
     explorer: {title: 'The sentence machine',        blurb: 'Snap word blocks together and the picture changes.'},
     tinkerer: {title: 'Tense on a timeline',         blurb: 'Slide the action through time and watch the verb change.'},
     modeller: {title: 'Who did what to whom',        blurb: 'Flip a sentence from active to passive, and report what someone said.'},
     theorist: {title: 'Transforming sentences',     blurb: 'Simple, compound, complex: rebuild one sentence three ways without changing what it means.'},
   }},

  {id: 'gravity', name: 'Falling and Orbiting', subject: 'Physics', hue: '#3057c9',
   tagline: 'Why things fall, and why the Moon never lands.',
   steps: {
     theorist: {title: 'Why the Moon doesn’t fall',   blurb: 'Newton’s cannon: throw faster and faster until you miss the ground — orbit and escape speed, computed.'},
   }},

  /* Biology. Built from the top of the syllabus down: Classes 9–12 are verified against
     the official CBSE 2026-27 and CISCE 2028 documents (curriculum/), and the younger
     bands are added once the Class 1–8 map confirms what those classes actually teach. */
  {id: 'heart', name: 'Breath, Heart and Blood', subject: 'Biology', hue: '#c8323c',
   tagline: 'From counting your breaths to the pressures of one cardiac cycle.',
   steps: {
     tinkerer: {title: 'Every breath you take', blurb: 'Pull the diaphragm and the lungs fill. Run, and count how fast you breathe — and what your breath carries out.'},
     modeller: {title: 'Double circulation',            blurb: 'Follow one red blood cell through the heart twice — and find out why a fish only needs once.'},
     theorist: {title: 'The cardiac cycle, measured',   blurb: 'Valves open when pressure says so. Lub, dub and the ECG fall out of the model.'},
   }},
  {id: 'cells', name: 'Cells', subject: 'Biology', hue: '#8a5cf6',
   tagline: 'From the smallest living unit to the dance of chromosomes.',
   steps: {
     tinkerer: {title: 'Zoom into life', blurb: 'Is an elephant made of bigger cells than an ant? Zoom from an organism down to its cells and find out.'},
     modeller: {title: 'A cell in a beaker',            blurb: 'Change the water outside and watch the cell swell, shrink, burst — or hold firm.',
       parts: [
         {id: null, title: "A cell in a beaker", blurb: "Change the water outside and watch the cell swell, shrink, burst - or hold firm."},
         {id: "organelle", title: "Who does what inside", built: false, blurb: "Take a part out and watch the cell fail in exactly that way."},
       ],
     },
     theorist: {title: 'Mitosis and meiosis, counted',  blurb: 'Move the chromosomes yourself, cross them over, and count every copy.'},
   }},
  {id: 'leaf', name: 'How Plants Make Food', subject: 'Biology', hue: '#2f9e5b',
   tagline: 'From a plant that needs sunlight to the Calvin cycle.',
   steps: {
     tinkerer: {title: 'The leaf, a food factory', blurb: 'Light, water and air go in; starch and oxygen come out. And at night the plant breathes out too.'},
     modeller: {title: 'What limits photosynthesis?',   blurb: 'Count the bubbles from a water plant as you move the lamp, add CO₂, warm the water.'},
     theorist: {title: 'Light reactions and the Calvin cycle', blurb: 'Switch the light off and watch PGA rise. Every ATP and NADPH is accounted for.',
       parts: [
         {id: null, title: "Light reactions and the Calvin cycle", blurb: "Switch the light off and watch PGA rise. Every ATP and NADPH is accounted for."},
         {id: "pigments", title: "The pigments and the spectrum", built: false, blurb: "Why a leaf is green, and which colours actually drive the reaction."},
         {id: "c4", title: "C3, C4 and the cost of photorespiration", built: false, blurb: "Warm it up and watch RuBisCO grab oxygen instead."},
       ],
     },
   }},
  {id: 'genes', name: 'From Parents to Children', subject: 'Biology', hue: '#d68a12',
   tagline: 'Why children look like their parents — and why not exactly.',
   steps: {
     modeller: {title: 'Mendel’s garden',               blurb: 'Grow a thousand pea plants and watch 3 : 1 appear out of chance.'},
     theorist: {title: 'The breeding lab',              blurb: 'Incomplete dominance, blood groups, linked genes and a pedigree you build.',
       parts: [
         {id: null, title: "The breeding lab", blurb: "Cross your own plants and count the offspring, generation after generation."},
         {id: "linkage", title: "Linked genes and the map", built: false, blurb: "Genes on the same chromosome travel together - unless they cross over."},
         {id: "pedigree", title: "Reading a pedigree", built: false, blurb: "Work backwards from a family tree to the genotypes that explain it."},
       ],
     },
   }},
  {id: 'webs', name: 'Who Eats Whom', subject: 'Biology', hue: '#7a8b1f',
   tagline: 'Food chains, food webs, and how one change leads to another.',
   steps: {
     modeller: {title: "Energy through the food chain", blurb: "Only about a tenth of the energy makes it to the next level."},
     tinkerer: {title: 'Pull one thread of the web', blurb: 'Take the snakes out of a rice field and watch what happens to the rice.',
       parts: [
         {id: null, title: "The web of who eats whom", blurb: "Remove one animal and watch the whole web move."},
         {id: "cycles", title: "What goes round: carbon, nitrogen, water", built: false, blurb: "Follow one atom through the living and the non-living."},
       ],
     },
     theorist: {title: 'Populations grow', blurb: 'Exponential and logistic growth, age pyramids and predator–prey cycles.'},
   }},
  {id: 'dna', name: 'The Code of Life', subject: 'Biology', hue: '#1f8fb3',
   tagline: 'How a string of four letters becomes a living thing.',
   steps: {
     theorist: {title: 'From DNA to protein',           blurb: 'Unzip DNA, read a gene through the real codon table, and flip the lac operon’s switch.',
       parts: [
         {id: null, title: "From DNA to protein", blurb: "Transcribe and translate a gene, codon by codon, and watch the lac operon switch."},
         {id: "structure", title: "The double helix, measured", built: false, blurb: "Chargaff\\’s ratios, the grooves, and why the strands run opposite ways."},
         {id: "replication", title: "Replication, leading and lagging", built: false, blurb: "One strand is copied in one run; the other has to be stitched."},
       ],
     },
   }},

  /* Wave 3 — generated by curriculum/wave3.py from the verified syllabus maps. */
  {id: 'circuits', name: "Electricity", subject: "Physics", hue: '#e0a100',
   tagline: "From lighting a bulb to Kirchhoff’s laws.",
   steps: {
     tinkerer: {title: "Light the bulb", blurb: "Build circuits from cells, switches and bulbs; conductors, and what heats and what magnetises."},
     modeller: {title: "Ohm’s law and the circuit", blurb: "Wire series and parallel, read the meters, and let V–I graphs appear."},
     theorist: {title: "Kirchhoff, measured", blurb: "Loops and junctions, internal resistance, the Wheatstone bridge balanced by hand.",
       parts: [
         {id: null, title: "Kirchhoff, measured", blurb: "Build a circuit and watch the two laws settle every current in it."},
         {id: "drift", title: "What a current really is", built: false, blurb: "Electrons drift a millimetre a second, and the lamp still lights at once."},
         {id: "bridge", title: "The metre bridge and the potentiometer", built: false, blurb: "Balance it, and the unknown resistance falls out of a length."},
       ],
     },
   }},
  {id: 'light', name: "Light", subject: "Physics", hue: '#f2c230',
   tagline: "From shadows to the double slit.",
   steps: {
     explorer: {title: "Splitting white light", built: false, blurb: "Send sunlight through a prism and find the colours hiding inside."},
     tiny: {title: "Make a rainbow", blurb: "Spray water in the sunshine and find where the rainbow hides."},
     tinkerer: {title: "Mirrors, lenses and shadows", blurb: "Trace rays off mirrors and through lenses, and cast shadows you can predict.",
       parts: [
         {id: null, title: "Mirrors, lenses and shadows", blurb: "Trace rays off mirrors and through lenses, and cast shadows you can predict."},
         {id: "shadow", title: "The shape of a shadow", blurb: "Move the lamp and the object; the shadow changes size and sharpness because the model traces the rays."},
         {id: "plane", title: "Behind the mirror", blurb: "Find your image: as far behind the glass as you are in front of it."},
       ],
     },
     modeller: {title: "Refraction and the eye", blurb: "Bend light into glass, find the image with the lens formula, and fix a short-sighted eye.",
       parts: [
         {id: null, title: "Refraction and the eye", blurb: "Bend light through water and glass, and focus it on a retina."},
         {id: "mirrorform", title: "The mirror formula, measured", built: false, blurb: "Move the object and let the model find the image - then check the formula."},
         {id: "dispersion", title: "Splitting and scattering", built: false, blurb: "A prism sorts the colours; the sky scatters the blue."},
       ],
     },
     theorist: {title: "Rays and waves", blurb: "Build a microscope and telescope, then let light interfere through two slits."},
   }},
  {id: 'motion', name: "Motion and Force", subject: "Physics", hue: '#2f7de1',
   tagline: "From how fast to Newton’s laws in two dimensions.",
   steps: {
     tinkerer: {title: "How fast, how far", blurb: "Time a toy car with a stopwatch, plot distance against time, and push things with forces.",
       parts: [
         {id: null, title: "How fast, how far", blurb: "Time a toy car with a stopwatch, plot distance against time, and push things with forces."},
         {id: "pendulum", title: "The swinging pendulum", blurb: "Change the length, the mass and the pull: only one of them changes the time of a swing."},
         {id: "speed", title: "Reading a journey from its graph", blurb: "Steeper means faster. Flat means stopped."},
       ],
     },
     modeller: {title: "Graphs of motion, laws of force", blurb: "Drive a cart and watch its s–t and v–t graphs draw themselves; then add forces.",
       parts: [
         {id: null, title: "Graphs of motion, laws of force", blurb: "Draw a motion graph and watch the cart obey it, then push it with real forces."},
         {id: "friction", title: "Friction, and what it costs", built: false, blurb: "Change the surface and the load; the force needed changes with them."},
         {id: "pressure", title: "Force spread over an area", built: false, blurb: "The same weight, a different area, a different pressure."},
       ],
     },
     theorist: {title: "Motion in a plane", blurb: "Launch projectiles, bank a road, and resolve every force."},
   }},
  {id: 'shapes', name: "Shapes and Angles", subject: "Mathematics", hue: '#8a5cf6',
   tagline: "From finding shapes in shadows to conic sections.",
   steps: {
     tiny: {title: "Shape shadows", blurb: "Hold shapes up to the light and match their shadows."},
     explorer: {title: "Turns and mirror magic", blurb: "Turn a robot by quarter and half turns; build designs that fold onto themselves."},
     tinkerer: {title: "Lines, angles and symmetry", blurb: "Cross two lines, cut them with a transversal, and find the angles that must be equal."},
   }},
  {id: 'algebra', name: "Algebra", subject: "Mathematics", hue: '#d6453d',
   tagline: "From a balance to the derivative.",
   steps: {
     tinkerer: {title: "The balance and the box", blurb: "Find the unknown on a balance, and see (a + b)² as an area."},
     modeller: {title: "Lines, parabolas and their roots", blurb: "Two lines that meet (or don’t), and a parabola whose roots you can drag."},
     theorist: {title: "Secant to tangent", blurb: "Slide the second point in and the secant becomes the tangent: the derivative, and where it is zero."},
   }},
  {id: 'numbers', name: "Numbers", subject: "Mathematics", hue: '#1f8a70',
   tagline: "From counting in tens to the other side of zero.",
   steps: {
     tiny: {title: "Tens and ones", blurb: "Bundle sticks into tens and count to 99."},
     explorer: {title: "The house of hundreds", blurb: "Build numbers with hundreds, tens and ones, and swap ten for one."},
     tinkerer: {title: "The other side of zero", blurb: "Positive and negative tokens that cancel — and why minus times minus is plus."},
   }},
  {id: 'weather', name: "Weather and Climate", subject: "Geography", hue: '#3f8fb0',
   tagline: "From winds and cyclones to the monsoon.",
   steps: {
     tiny: {title: "Which season is it?", blurb: "Dress Chintu for the sun, the rain and the cold — and watch the tree change."},
     tinkerer: {title: "Winds, storms and cyclones", blurb: "Heat the land, watch air rise, and grow a cyclone over a warm sea."},
     modeller: {title: "The atmosphere, layer by layer", blurb: "Climb through the atmosphere, and see what makes the climate."},
     theorist: {title: "Global winds and the monsoon", blurb: "Spin the Earth and watch winds turn; move the ITCZ and bring the monsoon."},
   }},
  {id: 'market', name: "Markets and Money", subject: "Economics", hue: '#b8641c',
   tagline: "From the price of onions to national income.",
   steps: {
     modeller: {title: "The price puzzle", blurb: "Buyers and sellers meet: shift demand or supply and find the new price. Then grow your savings."},
     theorist: {title: "Market equilibrium", blurb: "Price ceilings, floors and elasticity — and what each does to surplus."},
   }},
  {id: 'economy', name: "The Whole Economy", subject: "Economics", hue: '#9a5b2a',
   tagline: "How income flows round a country.",
   steps: {
     theorist: {title: "Circular flow and the multiplier", blurb: "Follow money round households and firms, and see a spending boost multiply."},
   }},
  {id: 'area', name: "Measuring Space", subject: "Mathematics", hue: '#c2569b',
   tagline: "From counting squares to Heron’s formula.",
   steps: {
     explorer: {title: "Grandmother's quilt", blurb: "Same lace, different quilt: does the area change?"},
     tinkerer: {title: "Area, perimeter and a right angle", blurb: "Same perimeter, different area; then prove Pythagoras by moving squares."},
     modeller: {title: "Similar triangles", blurb: "Scale a triangle and watch the ratios hold; split it with a parallel line."},
     theorist: {title: "Conic sections", blurb: "Slice a cone and get a circle, ellipse, parabola or hyperbola — with their foci."},
   }},
  {id: 'trig', name: "Triangles and Turns", subject: "Mathematics", hue: '#6a3fc2',
   tagline: "From the height of a tower to the unit circle.",
   steps: {
     modeller: {title: "Heights and distances", blurb: "Measure a tower with a shadow and an angle."},
     theorist: {title: "The unit circle", blurb: "Walk round a circle and draw sine and cosine; then undo them."},
   }},
  {id: 'chance', name: "Chance", subject: "Mathematics", hue: '#2f9e5b',
   tagline: "From tossing coins to Bayes’ theorem.",
   steps: {
     modeller: {title: "The mathematics of maybe", blurb: "Toss, roll and spin thousands of times, and watch the fractions settle."},
     theorist: {title: "Conditional probability and Bayes", blurb: "Test for a rare disease and find out why a positive test is not a certainty."},
   }},
  {id: 'atoms', name: "Inside the Atom", subject: "Chemistry", hue: '#e0567a',
   tagline: "From Rutherford’s gold foil to orbitals.",
   steps: {
     modeller: {title: "Journey inside the atom", blurb: "Fire alpha particles at gold foil and find the nucleus; then fill the shells."},
     theorist: {title: "Orbitals and the periodic table", blurb: "Fill orbitals by the rules and watch the periodic table build itself."},
   }},
  {id: 'bonding', name: "How Atoms Join", subject: "Chemistry", hue: '#d68a12',
   tagline: "From sharing electrons to the shapes of molecules.",
   steps: {
     theorist: {title: "Shapes of molecules", blurb: "Push electron pairs apart and the molecule takes its shape: VSEPR in 3-D.",
       parts: [
         {id: null, title: "Shapes of molecules", blurb: "Count the electron pairs and the shape follows."},
         {id: "ionic", title: "Ionic, covalent, and in between", built: false, blurb: "Pull on a shared pair and watch the bond turn polar."},
         {id: "orbitals", title: "Hybrid orbitals and sigma bonds", built: false, blurb: "Mix the orbitals and the geometry comes with them."},
       ],
     },
   }},
  {id: 'reactions', name: "Reactions: How Far and How Fast", subject: "Chemistry", hue: '#1f8fb3',
   tagline: "Equilibrium and the rate of reaction.",
   steps: {
     modeller: {title: "Metals and non-metals", blurb: "Dip metals into salt solutions: who displaces whom?"},
     theorist: {title: "Equilibrium and rate", blurb: "Stress an equilibrium and watch it shift; heat a reaction and watch it speed up."},
   }},
  {id: 'electrochem', name: "Electrochemistry", subject: "Chemistry", hue: '#3057c9',
   tagline: "Cells that make electricity.",
   steps: {
     theorist: {title: "The Daniell cell and Nernst", blurb: "Build a cell, change the concentrations, and read the voltage the Nernst equation predicts."},
   }},
  {id: 'matter', name: "Particles of Matter", subject: "Chemistry", hue: '#7b5cd6',
   tagline: "From melting ice to the kinetic theory of gases.",
   steps: {
     explorer: {title: "Water: ice, water, steam", blurb: "Warm and cool a pan and watch water change."},
     tinkerer: {title: "Particles on the move", blurb: "Heat water from ice to steam and watch the particles; dissolve sugar until no more will go."},
     theorist: {title: "Kinetic theory of gases", blurb: "A box of molecules: measure pressure from their collisions and find PV = nRT."},
   }},
  {id: 'magnetism', name: "Magnetism", subject: "Physics", hue: '#c8323c',
   tagline: "From fridge magnets to the AC generator.",
   steps: {
     tinkerer: {title: "Exploring magnets", blurb: "Find the poles, map the field with a compass, and make a magnet."},
     modeller: {title: "Electric current makes magnetism", blurb: "Pass current through a wire and a coil; build a motor."},
     theorist: {title: "Induction and AC", blurb: "Move the magnet and the flux changes; spin the coil and get AC; tune an LCR circuit."},
   }},
  {id: 'waves', name: "Sound and Waves", subject: "Physics", hue: '#16a3a3',
   tagline: "From a vibrating string to standing waves.",
   steps: {
     explorer: {title: "A rubber-band guitar", blurb: "Stretch and pluck: tighter and shorter sounds higher."},
     modeller: {title: "Sound waves", blurb: "Watch air compress and stretch, hear pitch and loudness change, and bounce an echo."},
     theorist: {title: "Oscillations and waves", blurb: "A spring and a pendulum in SHM, and a string that makes standing waves."},
   }},
  {id: 'body', name: "Control and Balance in the Body", subject: "Biology", hue: '#a0368f',
   tagline: "Nerves, kidneys and the body’s steady state.",
   steps: {
     modeller: {title: "Tissues in action", blurb: "Build joints and see which movements each allows."},
     theorist: {title: "The nerve impulse", blurb: "Stimulate a neuron and watch sodium rush in: the action potential, and the synapse."},
   }},
  {id: 'kidney', name: "The Kidney", subject: "Biology", hue: '#b5462a',
   tagline: "How blood is cleaned.",
   steps: {
     theorist: {title: "The nephron at work", blurb: "Follow blood through a nephron: filtration, reabsorption, and how much water you keep."},
   }},
  {id: 'evolution', name: "Evolution", subject: "Biology", hue: '#5a7d2a',
   tagline: "How populations change.",
   steps: {
     theorist: {title: "Selection and drift", blurb: "Run a population of moths through generations: selection, drift and Hardy–Weinberg."},
   }},
  {id: 'maps', name: "Maps and the Globe", subject: "Geography", hue: '#2e8b57',
   tagline: "From latitude and longitude to contour maps.",
   steps: {
     explorer: {title: "Maps and directions", blurb: "Face sunrise and find north; follow a map to school."},
     tinkerer: {title: "Locating places on the Earth", blurb: "Put a grid on a globe and find any city by latitude and longitude."},
     theorist: {title: "Time zones, projections and contours", blurb: "Longitude makes time; flatten a globe; read the shape of a hill from its contours."},
   }},
  {id: 'elections', name: "Elections", subject: "Political Science", hue: '#4a5bd6',
   tagline: "How votes become seats.",
   steps: {
     tinkerer: {title: "Universal franchise", blurb: "Every adult one vote: hold a class election."},
     theorist: {title: "Votes into seats", blurb: "The same votes, counted two ways: first-past-the-post against proportional representation."},
   }},

  /* Wave 4 — generated by curriculum/wave4.py from the verified syllabus maps. */
  {id: 'time', name: "Time", subject: "Mathematics", hue: '#c07a1a',
   tagline: "From my day to reading any clock.",
   steps: {
     tiny: {title: "My day", blurb: "Put Pihu’s day in order: wake, school, play, sleep — and watch the sun move."},
     explorer: {title: "Ticking clocks, turning calendars", blurb: "Turn the minute hand and the hour hand follows; count days on a calendar."},
   }},
  {id: 'multiply', name: "Groups and Jumps", subject: "Mathematics", hue: '#d0503f',
   tagline: "From counting in groups to multiplication.",
   steps: {
     tiny: {title: "Counting in groups", blurb: "Shells in groups of 2, 3 and 5 on the beach — count them fast."},
     explorer: {title: "Equal groups and animal jumps", blurb: "A frog jumps 3 at a time, a rabbit 4 — where do they land together?"},
   }},
  {id: 'measure', name: "Measuring", subject: "Mathematics", hue: '#3b8f6a',
   tagline: "From long and round to litres and grams.",
   steps: {
     tiny: {title: "Long, short, round", blurb: "Line up the toys: which is longest? Which rolls?"},
     explorer: {title: "Filling, lifting and measuring", blurb: "Pour water between jugs, weigh on a balance, and measure with handspans and a ruler."},
   }},
  {id: 'water', name: "Water", subject: "Science \u00b7 Geography", hue: '#2d8fd6',
   tagline: "From a precious drop to the journey of a river.",
   steps: {
     modeller: {title: "Water resources", blurb: "Catch the rain on a roof and store it."},
     explorer: {title: "Journey of a river", blurb: "Follow rain from the mountain to the sea, and find where the water goes."},
   }},
  {id: 'data', name: "Data and Graphs", subject: "Mathematics", hue: '#2f7d9c',
   tagline: "From pictographs to correlation.",
   steps: {
     explorer: {title: "Data through pictures", blurb: "Count, tally and draw a pictograph — then see what it hides."},
     tinkerer: {title: "Connecting the dots", blurb: "Plot the data yourself and read what the graph says."},
     modeller: {title: "Mean, median, mode", blurb: "Drag the data points and watch the three averages move differently."},
     theorist: {title: "Correlation", blurb: "Scatter the points and watch r; find the line of best fit."},
   }},
  {id: 'patterns', name: "Patterns and Sequences", subject: "Mathematics", hue: '#9b4dca',
   tagline: "From number patterns to infinite series.",
   steps: {
     tinkerer: {title: "Patterns and primes", blurb: "Build number patterns from dots, and sieve the primes."},
     modeller: {title: "What comes next", blurb: "Build a sequence, find its rule, and sum it the way Gauss did."},
     theorist: {title: "Sequences and series", blurb: "Geometric growth, AM ≥ GM, and sums that settle."},
   }},
  {id: 'ratio', name: "Ratio and Proportion", subject: "Mathematics", hue: '#c9602a',
   tagline: "Scaling recipes, maps and speeds.",
   steps: {
     tinkerer: {title: "Proportional reasoning", blurb: "Scale a recipe, read a map, share in a ratio."},
   }},
  {id: 'powers', name: "Powers", subject: "Mathematics", hue: '#5b5bd6',
   tagline: "From squares and cubes to logarithms.",
   steps: {
     tinkerer: {title: "Squares, cubes and powers", blurb: "Build squares and cubes from unit blocks; fold paper until it reaches the Moon."},
     modeller: {title: "Logarithms", blurb: "How many doublings? Logarithms undo powers."},
   }},
  {id: 'decimals', name: "Decimals", subject: "Mathematics", hue: '#e08a1e',
   tagline: "Beyond the point.",
   steps: {
     tinkerer: {title: "A peek beyond the point", blurb: "Zoom into a ruler past centimetres, millimetres and beyond."},
   }},
  {id: 'triangles', name: "Triangles", subject: "Mathematics", hue: '#b83f79',
   tagline: "Constructing and comparing triangles.",
   steps: {
     modeller: {title: "Congruence theorems", blurb: "Build triangles from given parts; when is only one possible?"},
     tinkerer: {title: "Three lines, one triangle", blurb: "Can any three sticks make a triangle? When are two triangles twins?"},
   }},
  {id: 'polygons', name: "Polygons and Circles", subject: "Mathematics", hue: '#1f8a8a',
   tagline: "Quadrilaterals, circles and tangents.",
   steps: {
     tinkerer: {title: "Quadrilaterals and area", blurb: "Drag the corners: when is it a parallelogram, a rhombus, a square?"},
     modeller: {title: "Circles and tangents", blurb: "Slide a line off a circle until it just touches."},
   }},
  {id: 'solids', name: "Solids", subject: "Mathematics", hue: '#8a6d3b',
   tagline: "Surface area and volume.",
   steps: {
     explorer: {title: "Nets and views", blurb: "Fold nets into boxes; see a block model from the top, front and side."},
     tiny: {title: "Shapes you can hold", blurb: "Roll, stack and slide solid shapes."},
     modeller: {title: "Surface area and volume", blurb: "Unfold a solid into its net; fill it with water."},
   }},
  {id: 'polynomials', name: "Polynomials", subject: "Mathematics", hue: '#a63d40',
   tagline: "Zeroes, graphs and factors.",
   steps: {
     modeller: {title: "Zeroes of a polynomial", blurb: "Drag the zeroes and the polynomial rebuilds itself."},
   }},
  {id: 'complex', name: "Complex Numbers", subject: "Mathematics", hue: '#6d3fc2',
   tagline: "Numbers that turn.",
   steps: {
     theorist: {title: "Multiplying is turning", blurb: "Put complex numbers on the Argand plane; multiply and watch them rotate."},
   }},
  {id: 'vectors', name: "Vectors and 3-D", subject: "Mathematics", hue: '#2b6cb0',
   tagline: "Arrows in space.",
   steps: {
     theorist: {title: "Vectors in space", blurb: "Add arrows tip to tail, project one on another, and find where two lines miss."},
   }},
  {id: 'matrices', name: "Matrices", subject: "Mathematics", hue: '#4a5568',
   tagline: "Matrices as transformations.",
   steps: {
     theorist: {title: "Matrices move the plane", blurb: "A 2×2 matrix stretches and turns a grid; the determinant is the area."},
   }},
  {id: 'calculus', name: "Change", subject: "Mathematics", hue: '#c05621',
   tagline: "Continuity and differential equations.",
   steps: {
     theorist: {title: "Slope fields", blurb: "Draw the slope field of a differential equation and let solutions flow."},
   }},
  {id: 'lp', name: "Linear Programming", subject: "Mathematics", hue: '#2f855a',
   tagline: "The best corner.",
   steps: {
     theorist: {title: "The feasible region", blurb: "Draw the constraints, slide the profit line, find the best corner."},
   }},
  {id: 'energy', name: "Energy", subject: "Physics", hue: '#dd6b20',
   tagline: "From how things work to the work–energy theorem.",
   steps: {
     explorer: {title: "How things work", blurb: "Spinners that wobble, things that float or sink, and a see-saw that lifts a rock."},
     modeller: {title: "Work, energy and machines", blurb: "Lift, push and swing: energy changes form but the total stays."},
     theorist: {title: "Work, energy and power", blurb: "Springs, collisions and the work–energy theorem."},
   }},
  {id: 'rotation', name: "Rotation", subject: "Physics", hue: '#805ad5',
   tagline: "Torque, angular momentum and rolling.",
   steps: {
     theorist: {title: "Spinning and rolling", blurb: "Balance a see-saw, spin a skater, and race a ring against a disc."},
   }},
  {id: 'heat', name: "Heat", subject: "Physics", hue: '#e53e3e',
   tagline: "From heat transfer to the laws of thermodynamics.",
   steps: {
     tinkerer: {title: "Heat on the move", blurb: "Conduction, convection and radiation — and land and sea breezes."},
     theorist: {title: "Thermodynamics", blurb: "Push a piston around a PV diagram and run an engine."},
   }},
  {id: 'fluids', name: "Fluids", subject: "Physics", hue: '#3182ce',
   tagline: "Pressure, buoyancy and flow.",
   steps: {
     theorist: {title: "Fluids at rest and in motion", blurb: "Pascal’s press, Bernoulli, and a ball falling through honey."},
   }},
  {id: 'charge', name: "Electric Charge", subject: "Physics", hue: '#d69e2e',
   tagline: "Fields, potential and capacitors.",
   steps: {
     theorist: {title: "Fields and potential", blurb: "Drop charges on a sheet and map the field and the equipotentials."},
   }},
  {id: 'quantum', name: "Light and the Atom", subject: "Physics", hue: '#9f7aea',
   tagline: "Photons and energy levels.",
   steps: {
     theorist: {title: "Photons and the atom", blurb: "Shine light on a metal: frequency matters, brightness doesn’t."},
   }},
  {id: 'electronics', name: "Semiconductors", subject: "Physics", hue: '#38a169',
   tagline: "Diodes and the p–n junction.",
   steps: {
     theorist: {title: "The p–n junction", blurb: "Dope silicon, build a junction, and draw its I–V curve."},
   }},
  {id: 'sky', name: "The Sky", subject: "Science", hue: '#1a365d',
   tagline: "Beyond the Earth: Moon, eclipses and calendars.",
   steps: {
     tinkerer: {title: "Moon, eclipses and calendars", blurb: "Line up the Sun, Earth and Moon for an eclipse; count a month by the Moon."},
   }},
  {id: 'carbon', name: "Carbon Compounds", subject: "Chemistry", hue: '#4a5568',
   tagline: "From chains of carbon to reaction mechanisms.",
   steps: {
     modeller: {title: "Carbon and its compounds", blurb: "Build chains and rings of carbon; name them; make soap."},
     theorist: {title: "Organic structures and mechanisms", blurb: "Isomers in 3-D, and why SN1 and SN2 go different ways."},
   }},
  {id: 'solutions', name: "Solutions", subject: "Chemistry", hue: '#319795',
   tagline: "Raoult’s law and colligative properties.",
   steps: {
     theorist: {title: "Solutions and colligative properties", blurb: "Add solute: the vapour pressure drops, the boiling point rises."},
   }},
  {id: 'acids', name: "Acids and Bases", subject: "Chemistry", hue: '#d53f8c',
   tagline: "From indicators to pH.",
   steps: {
     tinkerer: {title: "Acidic, basic or neutral?", blurb: "Test kitchen liquids with indicators and neutralise an acid."},
     modeller: {title: "Acids, bases and salts", blurb: "The pH scale, neutralisation and salts from your own reactions."},
   }},
  {id: 'lungs', name: "Breathing", subject: "Biology", hue: '#e05d5d',
   tagline: "Gas exchange and haemoglobin.",
   steps: {
     theorist: {title: "Breathing and exchange of gases", blurb: "Load oxygen in the lungs, unload it in a working muscle."},
   }},
  {id: 'respiration', name: "Cell Respiration", subject: "Biology", hue: '#dd6b20',
   tagline: "Glycolysis, Krebs and the ETS.",
   steps: {
     theorist: {title: "Respiration in cells", blurb: "Follow a glucose molecule to CO₂ and count the ATP."},
   }},
  {id: 'enzymes', name: "Enzymes", subject: "Biology", hue: '#319795',
   tagline: "How enzymes work.",
   steps: {
     theorist: {title: "Enzyme kinetics", blurb: "Add substrate until the enzymes are saturated; add an inhibitor."},
   }},
  {id: 'muscle', name: "Movement", subject: "Biology", hue: '#c53030',
   tagline: "Muscles and the sliding filament.",
   steps: {
     theorist: {title: "The sliding filament", blurb: "Release calcium and watch actin and myosin pull."},
   }},
  {id: 'reproduction', name: "Reproduction", subject: "Biology", hue: '#b83280',
   tagline: "How life continues.",
   steps: {
     modeller: {title: "How organisms reproduce", blurb: "Binary fission, budding, and pollination to a seed."},
     theorist: {title: "Hormones of the menstrual cycle", blurb: "Watch FSH, LH, oestrogen and progesterone rise and fall."},
   }},
  {id: 'immunity', name: "Health and Immunity", subject: "Biology", hue: '#2f855a',
   tagline: "From staying healthy to vaccines.",
   steps: {
     tinkerer: {title: "Health: the ultimate treasure", blurb: "Microbes, hygiene and how a vaccine trains the body."},
     theorist: {title: "The immune response", blurb: "A first infection and a second: why the second is faster."},
   }},
  {id: 'biotech', name: "Biotechnology", subject: "Biology", hue: '#3182ce',
   tagline: "Cutting and copying DNA.",
   steps: {
     theorist: {title: "Cut, copy and sort DNA", blurb: "Restriction enzymes, PCR and gel electrophoresis."},
   }},
  {id: 'earth', name: "The Changing Earth", subject: "Geography", hue: '#975a16',
   tagline: "Inside the Earth, and its moving plates.",
   steps: {
     tinkerer: {title: "Landforms and life", blurb: "Raise mountains and plateaus and see how life changes."},
     modeller: {title: "Shaping the Earth’s surface", blurb: "Rivers, wind and ice carve the land; plates build mountains."},
     theorist: {title: "Inside the Earth and plate tectonics", blurb: "Send earthquake waves through the Earth, and drift the continents."},
   }},
  {id: 'oceans', name: "Oceans", subject: "Geography", hue: '#2c5282',
   tagline: "Waves, tides and currents.",
   steps: {
     tinkerer: {title: "Currents and drifting plates", built: false, blurb: "Spin the Earth and watch the ocean gyres turn — then run the plates back 200 million years."},
     modeller: {title: "Oceans and life", blurb: "How deep, how salty, and what lives there."},
     theorist: {title: "Waves, tides and currents", blurb: "Line up the Moon and Sun for a spring tide."},
   }},
  {id: 'people', name: "Population", subject: "Geography", hue: '#b7791f',
   tagline: "How populations grow and move.",
   steps: {
     tinkerer: {title: "Dynamics of population", blurb: "Births, deaths and migration change a village; build its pyramid."},
     theorist: {title: "World population", blurb: "The demographic transition, stage by stage."},
   }},
  {id: 'banking', name: "Money and Banking", subject: "Economics", hue: '#2f855a',
   tagline: "From a savings account to how banks create money.",
   steps: {
     modeller: {title: "Money and credit", blurb: "Barter breaks down; credit helps or traps."},
     tinkerer: {title: "Banks and the magic of finance", blurb: "Deposit, borrow, and follow the money a bank lends on."},
     theorist: {title: "How banks create money", blurb: "The money multiplier, the reserve ratio and the RBI’s tools."},
   }},
  {id: 'firm', name: "The Firm", subject: "Economics", hue: '#744210',
   tagline: "Production and costs.",
   steps: {
     theorist: {title: "Production and costs", blurb: "Add workers to a fixed field: diminishing returns, and the cost curves."},
   }},
  {id: 'accounts', name: "Accounting", subject: "Accountancy", hue: '#2b6cb0',
   tagline: "Double entry and depreciation.",
   steps: {
     theorist: {title: "Double entry and depreciation", blurb: "Every transaction tips two accounts; watch an asset lose value two ways."},
   }},
  {id: 'development', name: "Development", subject: "Economics", hue: '#38a169',
   tagline: "What development means.",
   steps: {
     theorist: {title: "Human development", built: false, blurb: "Build the index from health, education and income."},
     modeller: {title: "Measuring development", blurb: "Income, health and education: compare places the way the book does."},
   }},
  {id: 'history', name: "History", subject: "History", hue: '#8b5e34',
   tagline: "How we know about the past.",
   steps: {
     tinkerer: {title: "Timelines and sources", blurb: "Dig a site layer by layer; place events on a BCE–CE timeline."},
     theorist: {title: "Bricks, beads and bones", blurb: "Explore a Harappan city: its grid, drains and standardised weights."},
   }},
  {id: 'computing', name: "Computing", subject: "Computer Science", hue: '#4c51bf',
   tagline: "Bits, gates and memory.",
   steps: {
     theorist: {title: "Bits, gates and memory", blurb: "Build logic from gates, add binary numbers, and see how memory is counted."},
   }},

  /* Wave 5 — generated by curriculum/wave5.py */
  {id: 'addition', name: "Adding and Taking Away", subject: "Mathematics", hue: '#e07b39',
   tagline: "From friends on a bench to carrying and borrowing.",
   steps: {
     tiny: {title: "Friends on the bench", blurb: "Friends sit down and get up; count how many are left."},
     explorer: {title: "Give and take on the hundred grid", blurb: "Open a crate of ten when you need to; hop +9 as +10 −1."},
   }},
  {id: 'position', name: "Where Is It?", subject: "Mathematics", hue: '#5a8de0',
   tagline: "Above, below, inside, behind.",
   steps: {
     tiny: {title: "Find the furry cat", blurb: "Hide the cat anywhere in the room and hear where it is."},
   }},
  {id: 'rhymes', name: "Sounds and Rhymes", subject: "English", hue: '#9b59b6',
   tagline: "Letter sounds, word families and rhymes.",
   steps: {
     tiny: {title: "The rhyme wheel", blurb: "Spin a new first sound onto -at, -en, -op and hear which words are real."},
   }},
  {id: 'tiling', name: "Tiles and Tangrams", subject: "Mathematics", hue: '#c0392b',
   tagline: "Shapes that fit together.",
   steps: {
     explorer: {title: "Tangrams and tiles", blurb: "Fill a shape with tangram pieces, then tile a floor with no gaps."},
     tinkerer: {title: "Constructions and tilings", blurb: "Why only triangles, squares and hexagons tile on their own."},
   }},
  {id: 'bignumbers', name: "Big Numbers", subject: "Mathematics", hue: '#16a085',
   tagline: "Thousands, lakhs and crores.",
   steps: {
     explorer: {title: "Thousands around us", blurb: "Pack, regroup and round big numbers."},
     tinkerer: {title: "A crore grains of rice", blurb: "Zoom from one grain to a crore, and count in other bases."},
   }},
  {id: 'microbes', name: "Microbes", subject: "Biology", hue: '#27ae60',
   tagline: "Tiny life that spoils food and helps us.",
   steps: {
     explorer: {title: "The mystery of food", blurb: "Keep bread warm or cold, wet or dry, and watch the mould."},
     theorist: {title: "Microbes in human welfare", blurb: "Curd, biogas and a sewage plant, run by microbes."},
   }},
  {id: 'materials', name: "Materials", subject: "Science", hue: '#8e6c3a',
   tagline: "What things are made of, and why.",
   steps: {
     explorer: {title: "Light through things", blurb: "Shine a torch through glass, paper, wood and cloth."},
     tinkerer: {title: "Materials around us", blurb: "Weigh, float, light and bend blocks of different materials."},
   }},
  {id: 'grammar', name: "Grammar Machines", subject: "English", hue: '#2c7be5',
   tagline: "Rules you can watch working.",
   steps: {
     explorer: {title: "The plural and a/an machine", blurb: "Drop in a word and the machine picks a or an, and makes it plural."},
   }},
  {id: 'codes', name: "Codes", subject: "English", hue: '#34495e',
   tagline: "Writing you can touch.",
   steps: {
     explorer: {title: "Braille", blurb: "Press dots in a Braille cell and read by touch."},
   }},
  {id: 'lifecycles', name: "Life Cycles", subject: "Biology", hue: '#2e8b57',
   tagline: "From egg and seed to adult.",
   steps: {
     explorer: {title: "From tadpole to frog", blurb: "Slide through time and watch a tadpole grow."},
     tinkerer: {title: "Seeds that wake up", blurb: "Give seeds water, air and warmth — only all three will do."},
   }},
  {id: 'puzzles', name: "Number Play", subject: "Mathematics", hue: '#8e44ad',
   tagline: "Patterns hiding in numbers.",
   steps: {
     tinkerer: {title: "Number play", blurb: "The Collatz path, Kaprekar’s 6174, and Virahanka’s beats."},
   }},
  {id: 'constructions', name: "Constructions", subject: "Mathematics", hue: '#2980b9',
   tagline: "Compass and ruler.",
   steps: {
     tinkerer: {title: "Playing with constructions", blurb: "A virtual compass and ruler: build rectangles and squares."},
   }},
  {id: 'classify', name: "The Variety of Life", subject: "Biology", hue: '#16a085',
   tagline: "Sorting living things.",
   steps: {
     tinkerer: {title: "Diversity in the living world", blurb: "Sort plants by their leaves, stems and roots."},
     modeller: {title: "Patterns in life", blurb: "Build a key that sorts 30 organisms into kingdoms."},
     theorist: {title: "Plant and animal kingdoms", blurb: "Life-cycle wheels and body plans."},
   }},
  {id: 'separation', name: "Separating Mixtures", subject: "Chemistry", hue: '#d35400',
   tagline: "Filtering, evaporating, chromatography.",
   steps: {
     tinkerer: {title: "Methods of separation", blurb: "Pick a method — only mixtures whose parts differ that way separate."},
     modeller: {title: "Mixtures and chromatography", blurb: "Run a paper chromatogram and read the Rf."},
   }},
  {id: 'factors', name: "Factors and Multiples", subject: "Mathematics", hue: '#c0392b',
   tagline: "HCF, LCM and prime factors.",
   steps: {
     tinkerer: {title: "Finding common ground", blurb: "Cut a rectangle into the biggest equal squares: that side is the HCF."},
     modeller: {title: "Real numbers", blurb: "Factor trees and prime bags: HCF and LCM, and why √2 is irrational."},
   }},
  {id: 'change', name: "Chemical Change", subject: "Chemistry", hue: '#e67e22',
   tagline: "From melting ice to balanced equations.",
   steps: {
     tinkerer: {title: "Physical or chemical?", blurb: "Melt, dissolve, burn, rust: do new substances form?"},
     modeller: {title: "Conservation and equations", blurb: "Weigh a reaction in a closed flask, then balance its equation."},
     theorist: {title: "The mole and the limiting reagent", blurb: "Mix molecules in any ratio and see which runs out."},
   }},
  {id: 'farming', name: "Farming", subject: "Geography", hue: '#6b8e23',
   tagline: "Seasons, crops and water.",
   steps: {
     tinkerer: {title: "The story of Indian farming", blurb: "Set the rain and warmth: which crop grows in which season?"},
   }},
  {id: 'percent', name: "Percentages", subject: "Mathematics", hue: '#d4a017',
   tagline: "Parts of a hundred.",
   steps: {
     tinkerer: {title: "Fractions in disguise", blurb: "Up 20%, then down 20%: are you back where you started?"},
   }},
  {id: 'fractals', name: "Fractals", subject: "Mathematics", hue: '#6c3483',
   tagline: "Shapes built from themselves.",
   steps: {
     tinkerer: {title: "The Koch snowflake", blurb: "Keep adding bumps: the edge grows forever, the area does not."},
   }},
  {id: 'coordinates', name: "Coordinate Geometry", subject: "Mathematics", hue: '#2471a3',
   tagline: "Points, distances and lines.",
   steps: {
     modeller: {title: "Orienting yourself", blurb: "Drop points on a grid; measure distances and divide segments."},
     theorist: {title: "Straight lines", blurb: "Drag two points and every form of the line updates."},
   }},
  {id: 'circles', name: "Circles", subject: "Mathematics", hue: '#1abc9c',
   tagline: "Angles in circles and the area of a circle.",
   steps: {
     modeller: {title: "Round and round", blurb: "The angle at the centre is twice the angle at the edge; and a circle unrolls into πr²."},
   }},
  {id: 'choice', name: "The Problem of Choice", subject: "Economics", hue: '#b9770e',
   tagline: "Scarcity and opportunity cost.",
   steps: {
     modeller: {title: "The problem of choice", blurb: "More of one thing means less of another: walk the frontier."},
   }},
  {id: 'periodic', name: "The Periodic Table", subject: "Chemistry", hue: '#6c5ce7',
   tagline: "Patterns among the elements.",
   steps: {
     modeller: {title: "Periodic classification", blurb: "Sort element cards by mass, then by number — watch the anomalies vanish."},
   }},
  {id: 'fields', name: "Charges in Motion", subject: "Physics", hue: '#8e44ad',
   tagline: "The Lorentz force.",
   steps: {
     theorist: {title: "Moving charges and magnetism", blurb: "Fire a charge into a magnetic field: circle, helix, or straight through."},
   }},
  {id: 'emwaves', name: "Electromagnetic Waves", subject: "Physics", hue: '#2980b9',
   tagline: "Light as a wave of fields.",
   steps: {
     theorist: {title: "Electromagnetic waves", blurb: "E and B in step, and the whole spectrum."},
   }},
  {id: 'nuclei', name: "The Nucleus", subject: "Physics", hue: '#c0392b',
   tagline: "Binding energy, fission and fusion.",
   steps: {
     theorist: {title: "Nuclei", blurb: "Split heavy nuclei or join light ones and read the energy."},
   }},
  {id: 'complexes', name: "Coordination Compounds", subject: "Chemistry", hue: '#d35400',
   tagline: "Why some compounds are coloured.",
   steps: {
     theorist: {title: "Colour from split d-orbitals", blurb: "Pick ligands: the d-orbitals split and the complex takes a colour."},
   }},
  {id: 'plants', name: "Plant Structure", subject: "Biology", hue: '#27ae60',
   tagline: "Flowers, stems and roots.",
   steps: {
     theorist: {title: "Morphology and anatomy", blurb: "Build a flower whorl by whorl; slice a stem."},
   }},
  {id: 'growth', name: "Plant Growth", subject: "Biology", hue: '#229954',
   tagline: "Growth curves and hormones.",
   steps: {
     theorist: {title: "Plant growth and development", blurb: "Move the light: auxin moves, the shoot bends."},
   }},
  {id: 'hormones', name: "Hormones", subject: "Biology", hue: '#a93226',
   tagline: "Chemical messengers and feedback.",
   steps: {
     theorist: {title: "Chemical coordination", blurb: "The thyroid loop: take away iodine and watch TSH rise."},
   }},
  {id: 'digestion', name: "Digestion", subject: "Biology", hue: '#ca6f1e',
   tagline: "From mouth to absorption.",
   steps: {
     theorist: {title: "Digestion and absorption", blurb: "Follow a meal through the gut and watch each enzyme work."},
   }},
  {id: 'biodiversity', name: "Biodiversity", subject: "Biology", hue: '#1e8449',
   tagline: "How many species, and why they vanish.",
   steps: {
     theorist: {title: "Species and area", built: false, blurb: "Sample bigger areas: species rise then level off."},
   }},
  {id: 'functions', name: "Functions", subject: "Mathematics", hue: '#6c3483',
   tagline: "Relations, functions and their graphs.",
   steps: {
     theorist: {title: "The function zoo", built: false, blurb: "Transform a function and watch domain and range change."},
   }},
  {id: 'counting', name: "Counting", subject: "Mathematics", hue: '#148f77',
   tagline: "Arrangements and selections.",
   steps: {
     theorist: {title: "Permutations and the binomial", built: false, blurb: "Arrange beads; count paths on a grid to find binomial coefficients."},
   }},
  {id: 'budget', name: "The Government Budget", subject: "Economics", hue: '#9a7d0a',
   tagline: "Receipts, spending and deficits.",
   steps: {
     theorist: {title: "Government budget", blurb: "Move a budget item and the deficits recompute."},
   }},
  {id: 'forex', name: "The Open Economy", subject: "Economics", hue: '#7d6608',
   tagline: "Exchange rates and the balance of payments.",
   steps: {
     theorist: {title: "Open economy", blurb: "Rupee demand and supply set the exchange rate."},
   }},
  {id: 'partnership', name: "Partnership Accounts", subject: "Accountancy", hue: '#1f618d',
   tagline: "Sharing profits among partners.",
   steps: {
     theorist: {title: "Partnership", blurb: "Admit a partner: shares re-slice; sacrifice and gain computed."},
   }},
  {id: 'cashflow', name: "Company Accounts", subject: "Accountancy", hue: '#1a5276',
   tagline: "Statements, ratios and cash flow.",
   steps: {
     theorist: {title: "From profit to cash", blurb: "Walk from net profit to cash from operations, step by step."},
   }},
  {id: 'brs', name: "Reconciliation and Errors", subject: "Accountancy", hue: '#154360',
   tagline: "Why the cash book and passbook disagree.",
   steps: {
     theorist: {title: "Bank reconciliation and errors", blurb: "Cheques in transit and errors that the trial balance can’t see."},
   }},
  {id: 'finance', name: "Financial Management", subject: "Business Studies", hue: '#117a65',
   tagline: "Debt, equity and returns.",
   steps: {
     theorist: {title: "Financial management", blurb: "Borrow more: when does it raise earnings per share?"},
   }},
  {id: 'programming', name: "Programming", subject: "Computer Science", hue: '#4a235a',
   tagline: "How a program runs.",
   steps: {
     theorist: {title: "Tracing a program", built: false, blurb: "Step through code and watch variables and the call stack."},
   }},
  {id: 'networks', name: "Networks", subject: "Computer Science", hue: '#1b4f72',
   tagline: "How data travels.",
   steps: {
     theorist: {title: "Computer networks", built: false, blurb: "Send packets through a network and break a link."},
   }},
  {id: 'databases', name: "Databases", subject: "Computer Science", hue: '#154360',
   tagline: "Tables, keys and queries.",
   steps: {
     theorist: {title: "Tables and SQL", built: false, blurb: "Write a query and watch rows match, join and group."},
   }},
  {id: 'climate', name: "Climate", subject: "Geography", hue: '#2874a6',
   tagline: "The Earth’s heat budget and climate change.",
   steps: {
     theorist: {title: "Heat balance and climate", built: false, blurb: "Where the Sun’s energy goes, and what extra CO₂ does."},
   }},
  {id: 'india-physical', name: "India's Rivers and Relief", subject: "Geography", hue: '#1e8449',
   tagline: "The physical India.",
   steps: {
     theorist: {title: "India's relief and rivers", built: false, blurb: "Rain on the Himalaya and the Deccan and follow where it drains."},
   }},
  {id: 'trade', name: "International Trade", subject: "Geography", hue: '#935116',
   tagline: "Who trades what with whom.",
   steps: {
     theorist: {title: "International trade", built: false, blurb: "Comparative advantage, and the balance of trade."},
   }},
  {id: 'travellers', name: "Through the Eyes of Travellers", subject: "History", hue: '#7e5109',
   tagline: "Al-Biruni, Ibn Battuta, Bernier.",
   steps: {
     theorist: {title: "Travellers’ India", built: false, blurb: "Follow three travellers across the map and read what they saw."},
   }},
  {id: 'vijayanagara', name: "Vijayanagara", subject: "History", hue: '#6e2c00',
   tagline: "An imperial capital.",
   steps: {
     theorist: {title: "An imperial capital", built: false, blurb: "Explore Hampi’s layout: walls, tanks and the royal centre."},
   }},
  {id: 'revolt1857', name: "The Revolt of 1857", subject: "History", hue: '#78281f',
   tagline: "Rebels and the Raj.",
   steps: {
     theorist: {title: "Rebels and the Raj", built: false, blurb: "Watch the revolt spread town by town, date by date."},
   }},
  {id: 'parliament', name: "Parliament", subject: "Political Science", hue: '#1f3a93',
   tagline: "How a bill becomes law.",
   steps: {
     theorist: {title: "How a bill becomes law", built: false, blurb: "Walk a bill through both houses and the President."},
   }},
  {id: 'un', name: "International Organisations", subject: "Political Science", hue: '#2e4053',
   tagline: "The UN and the veto.",
   steps: {
     theorist: {title: "The Security Council", built: false, blurb: "Cast votes on a resolution — and see what one veto does."},
   }},
  {id: 'count', name: "Counting and Comparing", subject: "Mathematics", hue: '#f2994a',
   tagline: "One more, one less, and who has more.",
   steps: {
     tiny: {title: "Mangoes on the branch", built: false, blurb: "Birds land and leave. Count them, and say who has more."},
   }},
  {id: 'tenframe', name: "Making Ten", subject: "Mathematics", hue: '#eb5757',
   tagline: "Ten is a bundle, and what is left over.",
   steps: {
     tiny: {title: "The ladybird's ten", blurb: "Drop spots on a ladybird; when ten fill up they snap into one ten."},
   }},
  {id: 'spans', name: "How Long Is It?", subject: "Mathematics", hue: '#56ccf2',
   tagline: "Measure with your own hands and feet.",
   steps: {
     tiny: {title: "Hands and feet", built: false, blurb: "Measure the mat with Lina's hand, then with her grandfather's."},
   }},
  {id: 'chart100', name: "The Hundred Chart", subject: "Mathematics", hue: '#2d9cdb',
   tagline: "Every number has a place, and the places make patterns.",
   steps: {
     tiny: {title: "The ant on the hundred chart", built: false, blurb: "An ant hops one step or one row. Guess where it lands."},
   }},
  {id: 'garland', name: "Tens That Break Apart", subject: "Mathematics", hue: '#bb6bd9',
   tagline: "Adding and taking away with bundles of ten.",
   steps: {
     tiny: {title: "Garlands of ten", built: false, blurb: "Ten flowers make a garland. Take one away and a garland must open."},
   }},
  {id: 'balance', name: "Heavier and Lighter", subject: "Mathematics", hue: '#27ae60',
   tagline: "Which one tips the pan?",
   steps: {
     tiny: {title: "Which is heavier?", built: false, blurb: "Put things on the pans and watch the balance tip."},
   }},
  {id: 'units', name: "Units of Length", subject: "Mathematics", hue: '#f2c94c',
   tagline: "From a millimetre to a kilometre, on one ruler.",
   steps: {
     explorer: {title: "From an ant to a city", built: false, blurb: "Zoom out step by step and watch the ruler re-label itself."},
   }},
  {id: 'division', name: "Sharing and Grouping", subject: "Mathematics", hue: '#eb8c34',
   tagline: "What is left over when it will not divide.",
   steps: {
     explorer: {title: "Sacks and leftovers", built: false, blurb: "Pack coconuts into sacks and see the remainder that will not fill one."},
   }},
  {id: 'verbs', name: "Verbs in Time", subject: "English", hue: '#4a7fd8',
   tagline: "What happened, what is happening, what has happened.",
   steps: {
     explorer: {title: "The verb machine", built: false, blurb: "Slide an action through time and watch the verb change with it."},
   }},
  {id: 'globe', name: "Our Shared Home", subject: "Geography", hue: '#1f9d8f',
   tagline: "One planet, seen from space.",
   steps: {
     explorer: {title: "The globe and the birds", built: false, blurb: "Spin the globe, name the oceans, and follow the flamingos home."},
   }},
  {id: 'symmetry', name: "Symmetry", subject: "Mathematics", hue: '#9b59b6',
   tagline: "Turn it, fold it: when does it look the same?",
   steps: {
     tinkerer: {title: "Turning a design onto itself", built: false, blurb: "Turn a design and catch every angle where it matches itself."},
   }},
  {id: 'temperature', name: "How Hot Is It?", subject: "Physics", hue: '#e2574c',
   tagline: "Touch lies; a thermometer does not.",
   steps: {
     tinkerer: {title: "How hot is it really?", built: false, blurb: "Metal feels colder than wood in the same room. Both are at room temperature."},
   }},
  {id: 'expressions', name: "Reading an Expression", subject: "Mathematics", hue: '#3d5afe',
   tagline: "Brackets decide what happens first.",
   steps: {
     tinkerer: {title: "Where the brackets go", built: false, blurb: "Move the brackets and watch the value change — and see why 3 + 4 x 2 is not 14."},
   }},
  {id: 'planets', name: "Why Here?", subject: "Science", hue: '#5b6ee1',
   tagline: "Move the Earth and lose the water.",
   steps: {
     tinkerer: {title: "The Goldilocks distance", built: false, blurb: "Push a planet nearer the Sun or farther out, and see what happens to its water."},
   }},
  {id: 'clauses', name: "Joining Sentences", subject: "English", hue: '#7b68ee',
   tagline: "And, but, because: two ideas, one sentence.",
   steps: {
     explorer: {title: "Two sentences, one joiner", built: false, blurb: "Join two sentence cards and find the joiner that still makes sense."},
   }},
  {id: 'relief', name: null, subject: null, hue: 'None',
   tagline: null,
   steps: {
     explorer: {title: "Different lands, different lives", built: false, blurb: "Raise the land into hills; the rain, the rivers and the houses follow."},
   }},
  {id: 'identities', name: "Algebra You Can See", subject: "Mathematics", hue: '#6a5acd',
   tagline: "An identity is an area, cut two ways.",
   steps: {
     modeller: {title: "Algebra tiles", built: false, blurb: "Tile a rectangle with x-squares, x-strips and units; the sides are the factors."},
   }},
  {id: 'control', name: "Signals in the Body", subject: "Biology", hue: '#c94f7c',
   tagline: "A reflex never asks the brain first.",
   steps: {
     modeller: {title: "The reflex arc", built: false, blurb: "Touch the hot pan and race the signal: the spinal reflex against the longer route through the brain."},
   }},
  {id: 'elastic', name: "Stretch and Break", subject: "Physics", hue: '#4e73df',
   tagline: "Every solid is a spring until it is not.",
   steps: {
     theorist: {title: "The stress–strain curve", built: false, blurb: "Hang loads on a wire and walk it from Hooke’s law to the breaking point."},
   }},
  {id: 'thermal', name: "Heat in Matter", subject: "Physics", hue: '#e07a5f',
   tagline: "Expansion, capacity, and the flow through a wall.",
   steps: {
     theorist: {title: "Thermal properties, measured", built: false, blurb: "Heat a bar, a calorimeter and a wall, and measure what each one does."},
   }},
  {id: 'redox', name: "Giving and Taking Electrons", subject: "Chemistry", hue: '#2f9e8f',
   tagline: "Oxidation numbers, balanced by the model.",
   steps: {
     theorist: {title: "Redox, balanced", built: false, blurb: "Assign oxidation numbers and watch the half-reactions balance themselves."},
   }},
  {id: 'blocks', name: "Across the Blocks", subject: "Chemistry", hue: '#8e7cc3',
   tagline: "Why sodium burns and neon does nothing.",
   steps: {
     theorist: {title: "The s- and p-block", built: false, blurb: "Walk across a period and down a group; the trends come out of the electrons."},
   }},
  {id: 'organelles', name: "Inside One Cell", subject: "Biology", hue: '#7f5fc0',
   tagline: "The unit of life, part by part.",
   steps: {
     theorist: {title: "The cell, part by part", built: false, blurb: "Take a cell apart and put it back together; every part does its job in the model."},
   }},
  {id: 'sets', name: "Sets and Venn", subject: "Mathematics", hue: '#3aa6a0',
   tagline: "Regions that are the logic.",
   steps: {
     theorist: {title: "The Venn machine", built: false, blurb: "Drag the circles; every region reports the elements actually in it."},
   }},
  {id: 'stats', name: "From Data to a Picture", subject: "Economics", hue: '#1f7a8c',
   tagline: "Collect it, organise it, draw it.",
   steps: {
     theorist: {title: "Raw data to a graph", built: false, blurb: "Bin the same data your own way and watch the histogram change shape."},
   }},
  {id: 'index', name: "Index Numbers", subject: "Economics", hue: '#b5651d',
   tagline: "What one number can say about every price.",
   steps: {
     theorist: {title: "Building a price index", built: false, blurb: "Set the basket and the weights; the index and the inflation rate follow."},
   }},
  {id: 'statements', name: "Final Accounts", subject: "Accountancy", hue: '#556b2f',
   tagline: "From the trial balance to the balance sheet.",
   steps: {
     theorist: {title: "Trading, P&L and balance sheet", built: false, blurb: "Post an adjustment and watch it land in two places at once."},
   }},
  {id: 'landforms', name: "How Landforms Are Made", subject: "Geography", hue: '#a0522d',
   tagline: "Weathering, rivers, glaciers, wind.",
   steps: {
     theorist: {title: "Cutting the land", built: false, blurb: "Run rain, ice and wind over a landscape for thousands of years."},
   }},
  {id: 'humidity', name: "Water in the Air", subject: "Geography", hue: '#2c7fb8',
   tagline: "Dew point, cloud and rain.",
   steps: {
     theorist: {title: "When the air lets go", built: false, blurb: "Cool the air until it can hold no more, and watch the cloud form."},
   }},
  {id: 'remote', name: "Seeing from Space", subject: "Geography", hue: '#3d5a80',
   tagline: "What a satellite actually records.",
   steps: {
     theorist: {title: "False colour", built: false, blurb: "Choose the bands, and the same scene tells you different things."},
   }},
  {id: 'functional', name: "Functional Groups", subject: "Chemistry", hue: '#d4823a',
   tagline: "The group decides the chemistry.",
   steps: {
     theorist: {title: "The functional group machine", built: false, blurb: "Swap the group on a carbon skeleton and the reactions change with it."},
   }},
  {id: 'surface', name: "Surfaces and Colloids", subject: "Chemistry", hue: '#6b8e23',
   tagline: "Everything happens on the surface.",
   steps: {
     theorist: {title: "Adsorption and colloids", built: false, blurb: "Raise the pressure and watch the surface fill up."},
   }},
  {id: 'ecosystem', name: "The Ecosystem", subject: "Biology", hue: '#3f8f5e',
   tagline: "Energy flows once; matter goes round.",
   steps: {
     theorist: {title: "Pyramids and productivity", built: false, blurb: "Feed the ecosystem sunlight and see how little of it reaches the top."},
   }},
  {id: 'organisation', name: "Organising a Business", subject: "Business Studies", hue: '#8d6e63',
   tagline: "Who reports to whom, and what that costs.",
   steps: {
     theorist: {title: "Span of control", built: false, blurb: "Set the span and the layers of the organisation build themselves."},
   }},
];
const threadOf = id => THREADS.find(t => t.id === id);

/* Where each page sits in the syllabus. ONE list, verified against the official documents
   in curriculum/ (CBSE 2026-27 curriculum and NCERT books; CISCE Year 2028 syllabuses), so a
   page can never claim a chapter on its own. `note` says so plainly where a page runs ahead
   of what a board teaches at that class. */
const SYLLABUS = {
  'sun-earth/tiny':     {tags: ['ICSE Class 1–2 EVS · The World Around Me: Sun, Moon, Sky and Stars'],
                         note: 'CBSE teaches why day and night happen in Class 5 (Our Wondrous World 5, Ch 9 “Rhythms of Nature”). Here it is early play.'},
  'sun-earth/explorer': {anchors: ['3/English/11', '5/The World Around Us/9'], tags: ['CBSE Class 4 · Our Wondrous World Ch 10 “Our Sky”', 'ICSE Class 3 · shapes of the Moon']},
  'sun-earth/tinkerer': {tags: ['CBSE Class 7 · Curiosity Ch 12', 'ICSE Class 9 · Geography']},
  'sun-earth/modeller': {tags: ['CBSE Class 9 · Exploration Ch 13 “Earth as a System”', 'ICSE Class 9 · Geography: insolation']},
  'sun-earth/theorist': {tags: ['CBSE Class 11 Physics · Ch 7 Gravitation', 'ISC Class 11 · Physics'],
                         note: 'Kepler’s laws are on the syllabus; changing the force law is an extension beyond it.'},
  'gravity/theorist':   {tags: ['CBSE Class 11 Physics · Ch 7 Gravitation', 'ISC Class 11 · Physics']},
  'fractions/tiny':     {tags: ['CBSE Class 2 · Joyful Mathematics Ch 8 “Grouping and Sharing”', 'CBSE Class 3 · Maths Mela Ch 8 “Fair Share”', 'ICSE Class 1–2 · half, quarter, whole']},
  'fractions/explorer': {anchors: ['4/Mathematics/5'], tags: ['CBSE Class 5 · Maths Mela Ch 2 “Fractions”', 'CBSE Class 6 · Ganita Prakash Ch 7']},
  'fractions/tinkerer': {tags: ['CBSE Class 7 · Ganita Prakash Part I Ch 8']},
  'fractions/modeller': {tags: ['CBSE Class 9 · Ganita Manjari Ch 3 “The World of Numbers”', 'ICSE Class 9 · rational and irrational numbers']},
  'fractions/theorist': {anchors: ['12/Mathematics/8'], tags: ['CBSE Class 11 Maths · Ch 8 (infinite GP)', 'CBSE Class 12 Maths · Ch 7–8 Integrals', 'ISC Class 11–12 · Mathematics']},
  'words/tiny':         {tags: ['CBSE Class 1–2 · Mridang: letter sounds and blending'],
                         /* Mridang teaches one sound family per chapter, so each chapter opens the
                            train on its own family instead of on the same default word. */
                         anchors: [{at: '1/English/1', label: 'Letter sounds'},
                                   {at: '1/English/3', label: 'Rhyming words: hen, pen, ten', state: {nCar: 3, cars: ['h', 'e', 'n']}},
                                   {at: '2/English/1', label: 'The a family: pan, tan, can', state: {nCar: 3, cars: ['p', 'a', 'n']}},
                                   {at: '2/English/2', label: 'The e family: pen, ten, net', state: {nCar: 3, cars: ['p', 'e', 'n']}},
                                   {at: '2/English/4', label: 'The o family: top, hop, pot', state: {nCar: 3, cars: ['t', 'o', 'p']}},
                                   {at: '2/English/5', label: 'The u family: hut, cut, tub', state: {nCar: 3, cars: ['h', 'u', 't']}},
                                   {at: '2/English/9', label: 'Blends: fl-a-g', state: {nCar: 4, cars: ['f', 'l', 'a', 'g']}},
                                   {at: '2/English/11', label: 'Blends: cl-a-p', state: {nCar: 4, cars: ['c', 'l', 'a', 'p']}}]},
  'words/explorer':     {tags: ['CBSE Class 3–5 · Santoor: articles, adjectives, adverbs, prepositions'],
                         anchors: ['3/English/3', '3/English/6', '4/English/2', '4/English/5', '4/English/10', '4/English/12',
                                   '5/English/2', '5/English/7']},
  'words/tinkerer':     {tags: ['CBSE Class 6–8 · Poorvi: past tenses (6), present perfect (7), future forms (8)'],
                         anchors: ['6/English/3', '6/English/4', '6/English/10', '7/English/4', '7/English/6', '7/English/7',
                                   '8/English/10', '8/English/12', '8/English/13']},
  'words/modeller':     {anchors: ['7/English/15', '9/English/~Grammar', '10/English/~Grammar', '8/English/7', '8/English/15'],
                         tags: ['CBSE Class 9–10 · grammar: reported speech', 'ICSE Class 9–10 · active and passive, reported speech'],
                         note: 'CBSE teaches the passive in Class 11–12 English Core (“passive forms in scientific writing”).'},
  'words/theorist':     {tags: ['CBSE Class 11–12 English Core · transformation of sentences', 'ISC English Paper 1 · transformation of sentences']},
  'heart/modeller':     {tags: ['CBSE Class 10 · Ch 5 Life Processes (Unit II, 25 marks)', 'ICSE Class 10 Biology · the circulatory system']},
  'heart/theorist':     {tags: ['CBSE Class 11 Biology · Ch 15 Body Fluids and Circulation (Unit V, 18 marks)', 'ISC Biology · circulation']},
  'heart/tinkerer':     {tags: ['CBSE Class 7 · Curiosity Ch 9 “Life Processes in Animals”: respiration in humans']},
  'cells/tinkerer':     {tags: ['CBSE Class 8 · Curiosity Ch 2 “The Invisible Living World”']},
  'leaf/tinkerer':      {tags: ['CBSE Class 7 · Curiosity Ch 10 “Life Processes in Plants”']},
  'webs/tinkerer':      {tags: ['CBSE Class 8 · Curiosity Ch 12 “How Nature Works in Harmony”']},
  'cells/modeller':     {tags: ['CBSE Class 9 · Exploration Ch 2 “Cell: The Building Block of Life” (Unit I, 27 marks)', 'ICSE Class 9 Biology · the cell', 'ICSE Class 10 · absorption by roots']},
  'cells/theorist':     {tags: ['CBSE Class 11 Biology · Ch 10 Cell Cycle and Cell Division (Unit III, 15 marks)', 'ISC Biology · cell division']},
  'leaf/modeller':      {tags: ['CBSE Class 10 · Ch 5 Life Processes: nutrition (Unit II, 25 marks)', 'ICSE Class 10 Biology · photosynthesis']},
  'leaf/theorist':      {tags: ['CBSE Class 11 Biology · Ch 11 Photosynthesis in Higher Plants (Unit IV, 12 marks)', 'ISC Biology · photosynthesis']},
  'genes/modeller':     {tags: ['CBSE Class 10 · Ch 8 Heredity', 'ICSE Class 10 Biology · genetics']},
  'genes/theorist':     {tags: ['CBSE Class 12 Biology · Ch 4 Principles of Inheritance and Variation (Unit VII, 20 marks)', 'ISC Biology · genetics']},
  'dna/theorist':       {tags: ['CBSE Class 12 Biology · Ch 5 Molecular Basis of Inheritance (Unit VII, 20 marks)', 'ISC Biology · molecular basis of inheritance']},
  /* Wave 3 (generated) */
  'circuits/tinkerer': {tags: ["CBSE Class 7 · Curiosity Ch 3 “Electricity: Circuits and their Components”", "CBSE Class 8 · Curiosity Ch 4 “Electricity: Magnetic and Heating Effects”"]},
  'circuits/modeller': {tags: ["CBSE Class 10 Science · Ch 11 Electricity"]},
  'circuits/theorist': {tags: ["CBSE Class 12 Physics · Ch 3 Current Electricity"]},
  'light/tinkerer': {tags: ["CBSE Class 7 · Curiosity Ch 11 “Light: Shadows and Reflections”", "CBSE Class 8 · Curiosity Ch 10 “Light: Mirrors and Lenses”"]},
  'light/modeller': {tags: ["CBSE Class 10 Science · Ch 9 Light - Reflection and Refraction", "CBSE Class 10 Science · Ch 10 The Human Eye and the Colourful World"]},
  'light/theorist': {tags: ["CBSE Class 12 Physics · Ch 9 Ray Optics and Optical Instruments", "CBSE Class 12 Physics · Ch 10 Wave Optics"]},
  'motion/tinkerer': {anchors: ['6/Science/5'], tags: ["CBSE Class 7 · Curiosity Ch 8 “Measurement of Time and Motion”", "CBSE Class 8 · Curiosity Ch 5 “Exploring Forces”"]},
  'motion/modeller': {tags: ["CBSE Class 9 Science · Ch 4 Describing Motion Around Us", "CBSE Class 9 Science · Ch 6 How Forces Affect Motion"]},
  'motion/theorist': {tags: ["CBSE Class 11 Physics · Ch 3 Motion in a Plane", "CBSE Class 11 Physics · Ch 4 Laws of Motion"]},
  'shapes/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 4 “Shadow Story”"]},
  'shapes/explorer': {anchors: ['3/Mathematics/14', '4/Mathematics/11'], tags: ["CBSE Class 5 · Maths Mela Ch 3 “Angles as Turns”", "CBSE Class 5 · Maths Mela Ch 10 “Symmetrical Designs”"]},
  'shapes/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 2 “Lines and Angles”", "CBSE Class 7 · Ganita Prakash Ch 5 “Parallel and Intersecting Lines”"]},
  'algebra/tinkerer': {anchors: ['8/Mathematics/6@Part II'], tags: ["CBSE Class 7 · Ganita Prakash Ch 7 “Finding the Unknown”", "CBSE Class 7 · Ganita Prakash Ch 4 “Expressions using Letter-Numbers”", "CBSE Class 8 · Ganita Prakash Ch 6 “We Distribute, Yet Things Multiply”"]},
  'algebra/modeller': {anchors: ['9/Mathematics/~Linear Equations in Two'], tags: ["CBSE Class 10 Mathematics · Ch 3 Pair of Linear Equations in Two Variables", "CBSE Class 10 Mathematics · Ch 4 Quadratic Equations"]},
  'algebra/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 12 Limits and Derivatives", "CBSE Class 12 Mathematics · Ch 6 Application of Derivatives"]},
  'numbers/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 8 “Fun with Numbers”"]},
  'numbers/explorer': {anchors: ['3/Mathematics/9'], tags: ["CBSE Class 3 · Maths Mela Ch 6 “House of Hundreds – I”", "CBSE Class 3 · Maths Mela Ch 3 “Double Century”"]},
  'numbers/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 10 “The Other Side of Zero”", "CBSE Class 7 · Ganita Prakash Ch 2 “Operations with Integers”"]},
  'weather/tinkerer': {anchors: ['7/Social Science/2@Part I'], tags: ["CBSE Class 8 · Curiosity Ch 6 “Pressure, Winds, Storms, and Cyclones”", "CBSE Class 7 · Exploring Society: India and Beyond Ch 3 “Climates of India”"]},
  'weather/modeller': {tags: ["CBSE Class 9 Social Science · Ch 3 Atmosphere and Climate"]},
  'weather/theorist': {tags: ["CBSE Class 11 Geography · Ch 9 Atmospheric Circulations and Weather Systems", "CBSE Class 11 Geography · India: Physical Environment · Ch 4 Climate"]},
  'market/modeller': {tags: ["CBSE Class 9 Social Science · Ch 9 The Price Puzzle: What Drives the Market", "CBSE Class 9 Social Science · Smart Ways to Manage Your Finances"]},
  'market/theorist': {tags: ["CBSE Class 11 Economics · Ch 5 Market Equilibrium", "CBSE Class 11 Economics · Ch 2 Theory of Consumer Behaviour"]},
  'economy/theorist': {tags: ["CBSE Class 12 Economics · Ch 2 National Income Accounting", "CBSE Class 12 Economics · Ch 4 Determination of Income and Employment"]},
  'area/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 6 “Perimeter and Area”", "CBSE Class 8 · Ganita Prakash Ch 2 “The Baudhayana-Pythagoras Theorem”"]},
  'area/modeller': {tags: ["CBSE Class 10 Mathematics · Ch 6 Triangles"]},
  'area/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 10 Conic Sections"]},
  'trig/modeller': {tags: ["CBSE Class 10 Mathematics · Ch 8 Introduction to Trigonometry", "CBSE Class 10 Mathematics · Ch 9 Some Applications of Trigonometry"]},
  'trig/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 3 Trigonometric Functions", "CBSE Class 12 Mathematics · Ch 2 Inverse Trigonometric Functions"]},
  'chance/modeller': {anchors: ['10/Mathematics/14'], tags: ["CBSE Class 9 Mathematics · Ch 7 The Mathematics of Maybe: Introduction to Probability"]},
  'chance/theorist': {anchors: ['11/Mathematics/14'], tags: ["CBSE Class 12 Mathematics · Ch 13 Probability"]},
  'atoms/modeller': {tags: ["CBSE Class 9 Science · Ch 8 Journey Inside the Atom"]},
  'atoms/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 2 Structure of Atom", "CBSE Class 11 Chemistry · Ch 3 Classification of Elements and Periodicity in Properties"]},
  'bonding/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 4 Chemical Bonding and Molecular Structure"]},
  'reactions/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 6 Equilibrium", "CBSE Class 12 Chemistry · Ch 3 Chemical Kinetics"]},
  'electrochem/theorist': {tags: ["CBSE Class 12 Chemistry · Ch 2 Electrochemistry"]},
  'matter/tinkerer': {tags: ["CBSE Class 8 · Curiosity Ch 7 “Particulate Nature of Matter”", "CBSE Class 8 · Curiosity Ch 9 “The Amazing World of Solutes, Solvents, and Solutions”", "CBSE Class 6 · Curiosity Ch 8 “A Journey through States of Water”"]},
  'matter/theorist': {tags: ["CBSE Class 11 Physics · Ch 12 Kinetic Theory", "CBSE Class 11 Chemistry · The Gaseous State (formative assessment only)"]},
  'magnetism/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 4 “Exploring Magnets”"]},
  'magnetism/modeller': {tags: ["CBSE Class 10 Science · Ch 12 Magnetic Effects of Electric Current"]},
  'magnetism/theorist': {tags: ["CBSE Class 12 Physics · Ch 6 Electromagnetic Induction", "CBSE Class 12 Physics · Ch 7 Alternating Current"]},
  'waves/modeller': {tags: ["CBSE Class 9 Science · Ch 10 Sound Waves: Characteristics and Applications"]},
  'waves/theorist': {tags: ["CBSE Class 11 Physics · Ch 13 Oscillations", "CBSE Class 11 Physics · Ch 14 Waves"]},
  'body/theorist': {tags: ["CBSE Class 11 Biology · Ch 18 Neural Control and Coordination"]},
  'kidney/theorist': {tags: ["CBSE Class 11 Biology · Ch 16 Excretory Products and their Elimination"]},
  'evolution/theorist': {anchors: ['10/Science/~Evolution'], tags: ["CBSE Class 12 Biology · Ch 6 Evolution"]},
  'maps/tinkerer': {tags: ["CBSE Class 6 · Exploring Society: India and Beyond Ch 1 “Locating Places on the Earth”"]},
  'maps/theorist': {tags: ["CBSE Class 11 Geography · Practical Work in Geography · Ch 3 Latitude, Longitude and Time", "CBSE Class 11 Geography · Practical Work in Geography · Ch 4 Map Projections", "CBSE Class 11 Geography · Practical Work in Geography · Ch 5 Topographical Maps"]},
  'elections/theorist': {anchors: ['9/Social Science/7'], tags: ["CBSE Class 11 Political Science · Ch 3 Election and Representation"]},
  'webs/theorist': {tags: ["CBSE Class 12 Biology · Ch 11 Organisms and Populations"]},
  /* Wave 4 (generated) */
  'weather/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 9 “Which Season is it?”"]},
  'time/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 10 “How do I Spend my Day?”"]},
  'time/explorer': {tags: ["CBSE Class 4 · Maths Mela Ch 12 “Ticking Clocks and Turning Calendar”"]},
  'multiply/tiny': {anchors: ['1/Mathematics/11'], tags: ["CBSE Class 2 · Joyful Mathematics Ch 1 “A Day at the Beach”"]},
  'multiply/explorer': {anchors: ['3/Mathematics/7', '4/Mathematics/13'], tags: ["CBSE Class 4 · Maths Mela Ch 9 “Equal Groups”", "CBSE Class 5 · Maths Mela Ch 13 “Animal Jumps”"]},
  'measure/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 2 “What is Long? What is Round?”"]},
  'measure/explorer': {anchors: ['3/Mathematics/10', '4/Mathematics/8'], tags: ["CBSE Class 3 · Maths Mela Ch 11 “Filling and Lifting”", "CBSE Class 4 · Maths Mela Ch 6 “Measuring Length”"]},
  'water/explorer': {tags: ["CBSE Class 3 · Our Wondrous World Ch 7 “Water — A Precious Gift”", "CBSE Class 5 · Our Wondrous World Ch 2 “Journey of a River”"]},
  'data/explorer': {tags: ["CBSE Class 5 · Maths Mela Ch 15 “Data Through Pictures”"]},
  'data/tinkerer': {anchors: ['6/Mathematics/4', '8/Mathematics/5@Part II'], tags: ["CBSE Class 7 · Ganita Prakash Ch 5 “Connecting the Dots...”"]},
  'data/modeller': {anchors: ['9/Mathematics/~Statistics', '11/Economics/~Measures of Central Tendency'], tags: ["CBSE Class 10 Mathematics · Ch 13 Statistics"]},
  'data/theorist': {anchors: ['12/Geography/3@Practical'], tags: ["CBSE Class 11 Economics · Ch 6 Correlation", "CBSE Class 11 Mathematics · Ch 13 Statistics"]},
  'patterns/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 1 “Patterns in Mathematics”", "CBSE Class 6 · Ganita Prakash Ch 5 “Prime Time”"]},
  'patterns/modeller': {tags: ["CBSE Class 9 Mathematics · Ch 8 Predicting What Comes Next: Exploring Sequences and Progressions", "CBSE Class 10 Mathematics · Ch 5 Arithmetic Progressions"]},
  'patterns/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 8 Sequences and Series"]},
  'ratio/tinkerer': {tags: ["CBSE Class 8 · Ganita Prakash Ch 7 “Proportional Reasoning-1”", "CBSE Class 8 · Ganita Prakash Ch 3 “Proportional Reasoning-2”"]},
  'powers/tinkerer': {tags: ["CBSE Class 8 · Ganita Prakash Ch 1 “A Square and A Cube”", "CBSE Class 8 · Ganita Prakash Ch 2 “Power Play”"]},
  'powers/modeller': {tags: ["CBSE Class 9 Mathematics at Advanced Level · Ch 2 Logarithms"]},
  'decimals/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 3 “A Peek Beyond the Point”", "CBSE Class 7 · Ganita Prakash Ch 4 “Another Peek Beyond the Point”"]},
  'triangles/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 7 “A Tale of Three Intersecting Lines”", "CBSE Class 7 · Ganita Prakash Ch 1 “Geometric Twins”"]},
  'polygons/tinkerer': {tags: ["CBSE Class 8 · Ganita Prakash Ch 4 “Quadrilaterals”", "CBSE Class 8 · Ganita Prakash Ch 7 “Area”"]},
  'polygons/modeller': {tags: ["CBSE Class 10 Mathematics · Ch 10 Circles"]},
  'solids/modeller': {anchors: ['9/Mathematics/~Surface Area and Volume'], tags: ["CBSE Class 10 Mathematics · Ch 12 Surface Areas and Volumes", "CBSE Class 10 Mathematics · Ch 11 Areas Related to Circles"]},
  'polynomials/modeller': {tags: ["CBSE Class 10 Mathematics · Ch 2 Polynomials"]},
  'complex/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 4 Complex Numbers and Quadratic Equations"]},
  'vectors/theorist': {anchors: ['11/Mathematics/11'], tags: ["CBSE Class 12 Mathematics · Ch 10 Vector Algebra", "CBSE Class 12 Mathematics · Ch 11 Three Dimensional Geometry"]},
  'matrices/theorist': {tags: ["CBSE Class 12 Mathematics · Ch 4 Determinants", "CBSE Class 12 Mathematics · Ch 3 Matrices"]},
  'calculus/theorist': {tags: ["CBSE Class 12 Mathematics · Ch 9 Differential Equations", "CBSE Class 12 Mathematics · Ch 5 Continuity and Differentiability"]},
  'lp/theorist': {tags: ["CBSE Class 12 Mathematics · Ch 12 Linear Programming"]},
  'energy/explorer': {tags: ["CBSE Class 4 · Our Wondrous World Ch 7 “How Things Work”"]},
  'energy/modeller': {tags: ["CBSE Class 9 Science · Ch 7 Work, Energy, and Simple Machines"]},
  'energy/theorist': {tags: ["CBSE Class 11 Physics · Ch 5 Work, Energy and Power"]},
  'rotation/theorist': {tags: ["CBSE Class 11 Physics · Ch 6 System of Particles and Rotational Motion"]},
  'heat/tinkerer': {tags: ["CBSE Class 7 · Curiosity Ch 7 “Heat Transfer in Nature”"]},
  'heat/theorist': {tags: ["CBSE Class 11 Physics · Ch 11 Thermodynamics", "CBSE Class 11 Chemistry · Ch 5 Thermodynamics"]},
  'fluids/theorist': {tags: ["CBSE Class 11 Physics · Ch 9 Mechanical Properties of Fluids"]},
  'charge/theorist': {tags: ["CBSE Class 12 Physics · Ch 1 Electric Charges and Fields", "CBSE Class 12 Physics · Ch 2 Electrostatic Potential and Capacitance"]},
  'quantum/theorist': {tags: ["CBSE Class 12 Physics · Ch 11 Dual Nature of Radiation and Matter", "CBSE Class 12 Physics · Ch 12 Atoms"]},
  'electronics/theorist': {tags: ["CBSE Class 12 Physics · Ch 14 Semiconductor Electronics: Materials, Devices and Simple Circuits"]},
  'sky/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 12 “Beyond Earth”", "CBSE Class 7 · Curiosity Ch 12 “Earth, Moon, and the Sun”", "CBSE Class 8 · Curiosity Ch 11 “Keeping Time with the Skies”"]},
  'carbon/modeller': {tags: ["CBSE Class 10 Science · Ch 4 Carbon and its Compounds"]},
  'carbon/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 8 Organic Chemistry: Some Basic Principles and Techniques", "CBSE Class 11 Chemistry · Ch 9 Hydrocarbons", "CBSE Class 12 Chemistry · Ch 6 Haloalkanes and Haloarenes"]},
  'solutions/theorist': {tags: ["CBSE Class 12 Chemistry · Ch 1 Solutions"]},
  'acids/tinkerer': {tags: ["CBSE Class 7 · Curiosity Ch 2 “Exploring Substances: Acidic, Basic, and Neutral”"]},
  'acids/modeller': {tags: ["CBSE Class 10 Science · Ch 2 Acids, Bases and Salts"]},
  'lungs/theorist': {tags: ["CBSE Class 11 Biology · Ch 14 Breathing and Exchange of Gases"]},
  'respiration/theorist': {tags: ["CBSE Class 11 Biology · Ch 12 Respiration in Plants"]},
  'enzymes/theorist': {tags: ["CBSE Class 11 Biology · Ch 9 Biomolecules"]},
  'muscle/theorist': {tags: ["CBSE Class 11 Biology · Ch 17 Locomotion and Movement"]},
  'reproduction/modeller': {anchors: ['9/Science/11'], tags: ["CBSE Class 10 Science · Ch 7 How do Organisms Reproduce?"]},
  'reproduction/theorist': {tags: ["CBSE Class 12 Biology · Ch 2 Human Reproduction", "CBSE Class 12 Biology · Ch 1 Sexual Reproduction in Flowering Plants"]},
  'immunity/tinkerer': {tags: ["CBSE Class 8 · Curiosity Ch 3 “Health: The Ultimate Treasure”"]},
  'immunity/theorist': {tags: ["CBSE Class 12 Biology · Ch 7 Human Health and Disease"]},
  'biotech/theorist': {tags: ["CBSE Class 12 Biology · Ch 9 Biotechnology: Principles and Processes"]},
  'webs/modeller': {tags: ["CBSE Class 10 Science · Ch 13 Our Environment"]},
  'earth/modeller': {tags: ["CBSE Class 9 Social Science · Ch 2 Shaping of the Earth's Surface"]},
  'earth/theorist': {anchors: ['11/Geography/2'], tags: ["CBSE Class 11 Geography · Ch 3 Interior of the Earth", "CBSE Class 11 Geography · Ch 4 Distribution of Oceans and Continents"]},
  'oceans/modeller': {tags: ["CBSE Class 9 Social Science · Oceans and Life"]},
  'oceans/theorist': {tags: ["CBSE Class 11 Geography · Ch 13 Movements of Ocean Water"]},
  'people/tinkerer': {tags: ["CBSE Class 8 · Exploring Society: India and Beyond Ch 6 “Dynamics of Population”"]},
  'people/theorist': {tags: ["CBSE Class 12 Geography · Ch 2 The World Population: Distribution, Density and Growth"]},
  'banking/tinkerer': {tags: ["CBSE Class 7 · Exploring Society: India and Beyond Ch 8 “Banks and the Magic of Finance”"]},
  'banking/theorist': {tags: ["CBSE Class 12 Economics · Ch 3 Money and Banking"]},
  'firm/theorist': {anchors: ['11/Economics/4'], tags: ["CBSE Class 11 Economics · Ch 3 Production and Costs"]},
  'accounts/theorist': {tags: ["CBSE Class 11 Accountancy · Recording of Transactions: vouchers, accounting equation, rules of debit and credit, journal, special purpose books, ledger", "CBSE Class 11 Accountancy · Depreciation, Provisions and Reserves"]},
  'development/modeller': {tags: ["CBSE Class 10 Social Science · Ch 1 Development"]},
  'elections/tinkerer': {tags: ["CBSE Class 8 · Exploring Society: India and Beyond Ch 5 “Universal Franchise and India's Electoral System”"]},
  'history/tinkerer': {tags: ["CBSE Class 6 · Exploring Society: India and Beyond Ch 4 “Timeline and Sources of History”"]},
  'history/theorist': {tags: ["CBSE Class 12 History · Ch 1 Bricks, Beads and Bones: The Harappan Civilisation"]},
  'computing/theorist': {tags: ["CBSE Class 11 Computer Science · Computer systems: Boolean logic, logic circuits, number systems"]},
  /* Wave 5 (generated) */
  'addition/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 5 “How Many?”", "CBSE Class 1 · Joyful Mathematics Ch 6 “Vegetable Farm”"]},
  'addition/explorer': {tags: ["CBSE Class 3 · Maths Mela Ch 12 “Give and Take”", "CBSE Class 3 · Maths Mela Ch 4 “Vacation with My Nani Maa”"]},
  'position/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 1 “Finding the Furry Cat!”"]},
  'solids/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 2 “Shapes Around Us”"]},
  'solids/explorer': {anchors: ['3/Mathematics/2'], tags: ["CBSE Class 4 · Maths Mela Ch 2 “Hide and Seek”", "CBSE Class 4 · Maths Mela Ch 1 “Shapes Around Us”"]},
  'rhymes/tiny': {tags: ["CBSE Class 1 · Mridang Ch 3 “Picture Time”", "CBSE Class 2 · Mridang Ch 2 “Picture Reading”"]},
  'light/tiny': {tags: ["CBSE Class 1 · Mridang Ch 9 “Anandi's Rainbow”"]},
  'area/explorer': {tags: ["CBSE Class 5 · Maths Mela Ch 11 “Grandmother's Quilt”", "CBSE Class 5 · Maths Mela Ch 6 “The Dairy Farm”"]},
  'tiling/explorer': {anchors: ['4/Mathematics/11'], tags: ["CBSE Class 3 · Maths Mela Ch 5 “Fun with Shapes”", "CBSE Class 5 · Maths Mela Ch 7 “Shapes and Patterns”"]},
  'tiling/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 6 “Constructions and Tilings”"]},
  'bignumbers/explorer': {tags: ["CBSE Class 4 · Maths Mela Ch 4 “Thousands Around Us”", "CBSE Class 5 · Maths Mela Ch 1 “We the Travellers — I”"]},
  'bignumbers/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 1 “Large Numbers Around Us”", "CBSE Class 8 · Ganita Prakash Ch 3 “A Story of Numbers”"]},
  'maps/explorer': {tags: ["CBSE Class 5 · Maths Mela Ch 14 “Maps and Locations”"]},
  'matter/explorer': {tags: ["CBSE Class 5 · Our Wondrous World Ch 1 “Water — The Essence of Life”"]},
  'microbes/explorer': {tags: ["CBSE Class 5 · Our Wondrous World Ch 3 “The Mystery of Food”"]},
  'microbes/theorist': {tags: ["CBSE Class 12 Biology · Ch 8 Microbes in Human Welfare"],
                        note: 'The chapter is qualitative, so the rate constants here are representative values from microbiology and sewage engineering, chosen to behave as the chapter describes.'},
  'waves/explorer': {tags: ["CBSE Class 5 · Our Wondrous World Ch 7 “Energy — How Things Work”"]},
  'materials/explorer': {tags: ["CBSE Class 3 · Our Wondrous World Ch 10 “This World of Things”"]},
  'materials/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 6 “Materials Around Us”"]},
  'grammar/explorer': {anchors: ['4/English/3'], tags: ["CBSE Class 3 · Santoor Ch 5 “Talking Toys”", "CBSE Class 3 · Santoor Ch 3 “Best Friends”"]},
  'codes/explorer': {anchors: ['4/English/6'], tags: ["CBSE Class 4 · Santoor Ch 6 “Braille”"]},
  'lifecycles/explorer': {tags: ["CBSE Class 5 · Santoor Ch 5 “The Frog”"]},
  'lifecycles/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 10 “Living Creatures: Exploring their Characteristics”"]},
  'puzzles/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 3 “Number Play”", "CBSE Class 7 · Ganita Prakash Ch 6 “Number Play”"]},
  'constructions/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 8 “Playing with Constructions”"]},
  'classify/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 2 “Diversity in the Living World”"]},
  'classify/modeller': {tags: ["CBSE Class 9 Science · Ch 12 Patterns in Life: Diversity and Classification"]},
  'classify/theorist': {tags: ["CBSE Class 11 Biology · Ch 3 Plant Kingdom", "CBSE Class 11 Biology · Ch 4 Animal Kingdom"]},
  'separation/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 9 “Methods of Separation in Everyday Life”"]},
  'separation/modeller': {tags: ["CBSE Class 9 Science · Ch 5 Exploring Mixtures and their Separation"]},
  'earth/tinkerer': {anchors: ['7/Social Science/1@Part I'], tags: ["CBSE Class 6 · Exploring Society: India and Beyond Ch 3 “Landforms and Life”"]},
  'factors/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 3 “Finding Common Ground”"]},
  'factors/modeller': {tags: ["CBSE Class 10 Mathematics · Ch 1 Real Numbers"]},
  'change/tinkerer': {tags: ["CBSE Class 7 · Curiosity Ch 5 “Changes Around Us: Physical and Chemical”", "CBSE Class 8 · Curiosity Ch 8 “Nature of Matter: Elements, Compounds, and Mixtures”"]},
  'change/modeller': {tags: ["CBSE Class 9 Science · Ch 9 Atomic Foundations of Matter", "CBSE Class 10 Science · Ch 1 Chemical Reactions and Equations"]},
  'change/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 1 Some Basic Concepts of Chemistry"]},
  'farming/tinkerer': {tags: ["CBSE Class 7 · Exploring Society: India and Beyond Ch 1 “The Story of Indian Farming”"]},
  'percent/tinkerer': {tags: ["CBSE Class 8 · Ganita Prakash Ch 1 “Fractions in Disguise”"]},
  'fractals/tinkerer': {tags: ["CBSE Class 8 · Ganita Prakash Ch 4 “Exploring Some Geometric Themes”"]},
  'body/modeller': {tags: ["CBSE Class 9 Science · Ch 3 Tissues"]},
  'coordinates/modeller': {tags: ["CBSE Class 9 Mathematics · Ch 1 Orienting Yourself: The Use of Coordinates", "CBSE Class 10 Mathematics · Ch 7 Coordinate Geometry"]},
  'coordinates/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 9 Straight Lines"]},
  'triangles/modeller': {tags: ["CBSE Class 9 Mathematics · Triangles - Congruence Theorems"]},
  'circles/modeller': {tags: ["CBSE Class 9 Mathematics · Ch 5 I'm Up and Down, and Round and Round", "CBSE Class 9 Mathematics · Ch 6 Measuring Space: Perimeter and Area"]},
  'choice/modeller': {anchors: ['11/Economics/1'], tags: ["CBSE Class 9 Social Science · Ch 8 Building Blocks in Economics: The Problem of Choice"]},
  'reactions/modeller': {tags: ["CBSE Class 10 Science · Ch 3 Metals and Non-metals"]},
  'periodic/modeller': {tags: ["CBSE Class 10 Science · Periodic Classification of Elements"]},
  'banking/modeller': {tags: ["CBSE Class 10 Social Science · Ch 3 Money and Credit"]},
  'water/modeller': {tags: ["CBSE Class 10 Social Science · Ch 3 Water Resources"]},
  'fields/theorist': {anchors: ['12/Physics/5'], tags: ["CBSE Class 12 Physics · Ch 4 Moving Charges and Magnetism"]},
  'emwaves/theorist': {tags: ["CBSE Class 12 Physics · Ch 8 Electromagnetic Waves"]},
  'nuclei/theorist': {tags: ["CBSE Class 12 Physics · Ch 13 Nuclei"]},
  'complexes/theorist': {anchors: ['12/Chemistry/4'], tags: ["CBSE Class 12 Chemistry · Ch 5 Coordination Compounds"]},
  'plants/theorist': {tags: ["CBSE Class 11 Biology · Ch 5 Morphology of Flowering Plants", "CBSE Class 11 Biology · Ch 6 Anatomy of Flowering Plants"]},
  'growth/theorist': {tags: ["CBSE Class 11 Biology · Ch 13 Plant Growth and Development"]},
  'hormones/theorist': {tags: ["CBSE Class 11 Biology · Ch 19 Chemical Coordination and Integration"]},
  'digestion/theorist': {tags: ["CBSE Class 11 Biology · Digestion and Absorption"]},
  'biodiversity/theorist': {anchors: ['12/Biology/~Environmental Issues'], tags: ["CBSE Class 12 Biology · Ch 13 Biodiversity and its Conservation"]},
  'functions/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 2 Relations and Functions", "CBSE Class 12 Mathematics · Ch 1 Relations and Functions"]},
  'counting/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 6 Permutations and Combinations", "CBSE Class 11 Mathematics · Ch 7 Binomial Theorem"]},
  'budget/theorist': {tags: ["CBSE Class 12 Economics · Ch 5 Government Budget and the Economy"]},
  'forex/theorist': {tags: ["CBSE Class 12 Economics · Ch 6 Open Economy Macroeconomics"]},
  'partnership/theorist': {tags: ["CBSE Class 12 Accountancy · Partnership fundamentals; P&L appropriation; past adjustments; goodwill; reconstitution: change in profit-sharing ratio, admission"]},
  'cashflow/theorist': {tags: ["CBSE Class 12 Accountancy · Cash flow statement", "CBSE Class 12 Accountancy · Financial statements of a company; comparative and common-size statements; accounting ratios"]},
  'brs/theorist': {tags: ["CBSE Class 11 Accountancy · Bank Reconciliation Statement", "CBSE Class 11 Accountancy · Trial Balance and Rectification of Errors"]},
  'finance/theorist': {tags: ["CBSE Class 12 Business Studies · Ch 9 Financial Management"]},
  'programming/theorist': {tags: ["CBSE Class 11 Computer Science · Problem solving, flowcharts; Python: tokens, types, operators, flow of control, strings, lists, tuples, dictionaries, modules", "CBSE Class 12 Computer Science · Functions, scope; exception handling; text, binary, CSV files; stack"]},
  'networks/theorist': {tags: ["CBSE Class 12 Computer Science · Evolution; data communication; switching; media; devices; topologies; protocols; web services"]},
  'databases/theorist': {tags: ["CBSE Class 12 Computer Science · Relational model, keys; SQL DDL/DML, joins, aggregates; Python-SQL connectivity"]},
  'climate/theorist': {tags: ["CBSE Class 11 Geography · Ch 8 Solar Radiation, Heat Balance and Temperature", "CBSE Class 11 Geography · Ch 11 World Climate and Climate Change"]},
  'india-physical/theorist': {tags: ["CBSE Class 11 Geography · India: Physical Environment · Ch 2 Structure and Physiography", "CBSE Class 11 Geography · India: Physical Environment · Ch 3 Drainage System"]},
  'development/theorist': {anchors: ['12/Economics/~India, Pakistan, China'], tags: ["CBSE Class 12 Geography · Ch 3 Human Development"]},
  'trade/theorist': {tags: ["CBSE Class 12 Geography · Ch 8 International Trade"]},
  'travellers/theorist': {tags: ["CBSE Class 12 History · Ch 5 Through the Eyes of Travellers"]},
  'vijayanagara/theorist': {tags: ["CBSE Class 12 History · Ch 7 An Imperial Capital: Vijayanagara"]},
  'revolt1857/theorist': {tags: ["CBSE Class 12 History · Ch 10 Rebels and the Raj"]},
  'parliament/theorist': {tags: ["CBSE Class 11 Political Science · Ch 4 Executive + 5 Legislature + 6 Judiciary"]},
  'un/theorist': {tags: ["CBSE Class 12 Political Science · Ch 4 International Organizations"]},
  'count/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 3 “Mango Treat”"]},
  'tenframe/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 4 “Making 10”"]},
  'spans/tiny': {tags: ["CBSE Class 1 · Joyful Mathematics Ch 7 “Lina's Family”"]},
  'chart100/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 3 “Fun with Numbers”"]},
  'garland/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 6 “Decoration for Festival”"]},
  'balance/tiny': {tags: ["CBSE Class 2 · Joyful Mathematics Ch 7 “Rani's Gift”"]},
  'units/explorer': {tags: ["CBSE Class 5 · Maths Mela Ch 5 “Far and Near”"]},
  'division/explorer': {tags: ["CBSE Class 5 · Maths Mela Ch 9 “Coconut Farm”"]},
  'light/explorer': {tags: ["CBSE Class 5 · Santoor Ch 3 “The Rainbow”"]},
  'verbs/explorer': {tags: ["CBSE Class 4 · Santoor Ch 9 “Hekko”", "CBSE Class 5 · Santoor Ch 4 “The Wise Parrot”"]},
  'globe/explorer': {tags: ["CBSE Class 5 · Our Wondrous World Ch 10 “Earth: Our Shared Home”"]},
  'symmetry/tinkerer': {tags: ["CBSE Class 6 · Ganita Prakash Ch 9 “Symmetry”"]},
  'temperature/tinkerer': {tags: ["CBSE Class 6 · Curiosity Ch 7 “Temperature and its Measurement”"]},
  'expressions/tinkerer': {tags: ["CBSE Class 7 · Ganita Prakash Ch 2 “Arithmetic Expressions”"]},
  'planets/tinkerer': {tags: ["CBSE Class 8 · Curiosity Ch 13 “Our Home: Earth, a Unique Life Sustaining Planet”"]},
  'oceans/tinkerer': {tags: ["CBSE Class 8 · Exploring Society: India and Beyond Ch 1 “World Geography: Some Glimpses”"]},
  'clauses/explorer': {tags: ["CBSE Class 4 · Santoor Ch 11 “A Journey to the Magical Mountains”"]},
  'relief/explorer': {tags: ["CBSE Class 4 · Our Wondrous World Ch 9 “Different Lands, Different Lives”"]},
  'identities/modeller': {tags: ["CBSE Class 9 Mathematics · Ch 4 Exploring Algebraic Identities"]},
  'control/modeller': {tags: ["CBSE Class 10 Science · Ch 6 Control and Coordination"]},
  'elastic/theorist': {tags: ["CBSE Class 11 Physics · Ch 8 Mechanical Properties of Solids"]},
  'thermal/theorist': {tags: ["CBSE Class 11 Physics · Ch 10 Thermal Properties of Matter"]},
  'redox/theorist': {tags: ["CBSE Class 11 Chemistry · Ch 7 Redox Reactions"]},
  'blocks/theorist': {tags: ["CBSE Class 11 Chemistry · s- and p-Block Elements (formative assessment only)"]},
  'organelles/theorist': {tags: ["CBSE Class 11 Biology · Ch 8 Cell: The Unit of Life"]},
  'sets/theorist': {tags: ["CBSE Class 11 Mathematics · Ch 1 Sets"]},
  'stats/theorist': {tags: ["CBSE Class 11 Economics · Ch 2 Collection of Data", "CBSE Class 11 Economics · Ch 3 Organisation of Data", "CBSE Class 11 Economics · Ch 4 Presentation of Data"]},
  'index/theorist': {tags: ["CBSE Class 11 Economics · Ch 7 Introduction to Index Numbers"]},
  'statements/theorist': {tags: ["CBSE Class 11 Accountancy · Financial Statements"]},
  'landforms/theorist': {tags: ["CBSE Class 11 Geography · Ch 5 Geomorphic Processes", "CBSE Class 11 Geography · Ch 6 Landforms and their Evolution"]},
  'humidity/theorist': {tags: ["CBSE Class 11 Geography · Ch 10 Water in the Atmosphere"]},
  'remote/theorist': {tags: ["CBSE Class 11 Geography · Practical Work in Geography · Ch 6 Introduction to Remote Sensing", "CBSE Class 12 Geography · Practical Work in Geography · Ch 4 Spatial Information Technology"]},
  'functional/theorist': {tags: ["CBSE Class 12 Chemistry · Ch 7 Alcohols, Phenols and Ethers", "CBSE Class 12 Chemistry · Ch 8 Aldehydes, Ketones and Carboxylic Acids", "CBSE Class 12 Chemistry · Ch 9 Amines"]},
  'surface/theorist': {tags: ["CBSE Class 12 Chemistry · Surface Chemistry (formative assessment only)"]},
  'ecosystem/theorist': {tags: ["CBSE Class 12 Biology · Ch 12 Ecosystem"]},
  'organisation/theorist': {tags: ["CBSE Class 12 Business Studies · Ch 5 Organising", "CBSE Class 12 Business Studies · Ch 7 Directing"]},
};
const syllabusOf = (thread, band) => SYLLABUS[thread + '/' + band] || null;
/* A chapter is rarely one idea. A step may hold a SEQUENCE of pages, its `parts`: part 0 is
   <band>.html and the rest are <band>-<id>.html, walked in the order the chapter teaches them.
   A step with no `parts` is a single page, exactly as before. */
const pageOf = (thread, band, part) => `threads/${thread}/${band}${part ? '-' + part : ''}.html`;
const partsOf = (thread, band) => {
  const st = (threadOf(thread) || {steps: {}}).steps[band];
  return (st && st.parts) || null;
};
const partList = (thread, band) => {
  const st = (threadOf(thread) || {steps: {}}).steps[band];
  if (!st) return [];
  return st.parts ? st.parts.map((p, i) => Object.assign({i}, p))
                  : [{i: 0, id: null, title: st.title, blurb: st.blurb, built: st.built !== false}];
};

/* Links are written relative to web/. A page under threads/<id>/ needs ../../ */
const BASE = /\/threads\/[^/]+\/[^/]*$/.test(location.pathname) ? '../../' : '';

/* ══════════════════════════════════════════════════════════════════════════
   2. Small helpers.
   ══════════════════════════════════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
/* Never throws: a label built before its number exists shows a dash, not a TypeError. */
const fmt = (n, dp = 1) => (n == null || !isFinite(n)) ? '—' : (Math.abs(n) < 5e-9 ? 0 : +n).toFixed(dp);
function mulberry32(a){
  return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

/* A frame loop that hands the callback dt in seconds, pauses while the tab is hidden, and
   never lets one long frame (a tab switch) arrive as a giant step. */
function loop(fn){
  let raf = 0, last = 0, on = true;
  const tick = t => {
    if (!on) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    fn(dt, t / 1000);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {stop(){ on = false; cancelAnimationFrame(raf); }, get running(){ return on; }};
}
/* ──────────────────────────────────────────────────────────────────────────
   clock({mount, onTick, speeds, speed, playing, step})

   A model that advances in time must be the learner's to control: they need to
   stop it, slow it down, and step it one beat at a time to see what happened.
   This is that control, so every page has the same one.

     const c = Play.clock({mount: $('clock'), onTick: dt => advance(dt)});
     c.pause(); c.play(); c.speed = 0.25; c.stepOnce();

   onTick is called with model-seconds, already scaled by the chosen speed, so a
   page never multiplies by the speed itself. Under reduced motion it starts
   paused, and Step is the way through.
   ────────────────────────────────────────────────────────────────────────── */
function clock(o){
  const speeds = o.speeds || [0.25, 0.5, 1, 2, 4];
  const st = {speed: o.speed == null ? 1 : o.speed, playing: o.playing !== false && !reduced(), beat: o.step || 0.1};
  const host = o.mount;
  let lp = null;
  const paint = () => {
    if (!host) return;
    host.innerHTML = `<div class="pg-clock">
      <button class="pg-cbtn play" aria-pressed="${st.playing}" title="${st.playing ? 'Pause' : 'Play'}">${st.playing ? '❚❚' : '▶'}</button>
      <button class="pg-cbtn step" title="One step">▶❙</button>
      <span class="pg-speeds">${speeds.map(v =>
        `<button class="pg-sp${v === st.speed ? ' on' : ''}" data-speed="${v}">${v === 1 ? '1×' : (v < 1 ? v + '×' : v + '×')}</button>`).join('')}</span>
    </div>`;
  };
  const tick = dt => { if (st.playing && o.onTick) o.onTick(dt * st.speed); };
  if (host){
    paint();
    host.addEventListener('click', e => {
      const sp = e.target.closest('[data-speed]');
      if (sp){ st.speed = +sp.dataset.speed; paint(); track('speed', {speed: st.speed}); return; }
      if (e.target.closest('.play')){ st.playing = !st.playing; paint(); track(st.playing ? 'play' : 'pause'); return; }
      if (e.target.closest('.step')){ st.playing = false; paint(); if (o.onTick) o.onTick(st.beat * st.speed); track('step'); }
    });
  }
  lp = loop(tick);
  return {
    get speed(){ return st.speed; }, set speed(v){ st.speed = v; paint(); },
    get playing(){ return st.playing; },
    play(){ st.playing = true; paint(); },
    pause(){ st.playing = false; paint(); },
    stepOnce(){ st.playing = false; paint(); if (o.onTick) o.onTick(st.beat * st.speed); },
    stop(){ lp.stop(); },
  };
}

/* Tween a number; resolves when done. Under reduced motion it jumps. */
function tween(from, to, ms, onStep, e = ease.inOut){
  return new Promise(res => {
    if (reduced() || ms <= 0) { onStep(to); return res(); }
    const t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / ms, 0, 1);
      onStep(lerp(from, to, e(k)));
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════════════
   3. SVG pointer and drag.

   Pointer events with capture, so a drag that leaves the SVG keeps going.
   The handlers get points in the SVG's own user units.
   ══════════════════════════════════════════════════════════════════════════ */
function svgPoint(svg, e){
  const m = svg.getScreenCTM();
  if (!m) return {x: 0, y: 0};
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(m.inverse());
  return {x: q.x, y: q.y};
}
/* drag(node, svg, {start(p, e), move(p, e), end(p, e)}) — start may return false to refuse. */
function drag(node, svg, h){
  let id = null;
  node.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    const p = svgPoint(svg, e);
    if (h.start && h.start(p, e) === false) return;
    id = e.pointerId;
    try { node.setPointerCapture(id); } catch (_) {}
    node.classList.add('dragging');
    e.preventDefault();
  });
  node.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    h.move && h.move(svgPoint(svg, e), e);
  });
  const up = e => {
    if (e.pointerId !== id) return;
    id = null;
    node.classList.remove('dragging');
    h.end && h.end(svgPoint(svg, e), e);
  };
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Sound. A tiny synth, so there are no audio files to ship.
   ══════════════════════════════════════════════════════════════════════════ */
let AC = null;
const audio = () => {
  if (!AC) { try { AC = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
};
let SOUND_ON = true;
function tone(freq, dur, type = 'sine', gain = 0.12, when = 0, slideTo = null){
  if (!FF('sound') || !SOUND_ON) return;          // pages call tone() directly too: honour the toggle
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const SOUNDS = {
  pop:    () => tone(520, 0.12, 'triangle', 0.14, 0, 880),
  tick:   () => tone(1400, 0.03, 'square', 0.03),
  snap:   () => { tone(300, 0.06, 'square', 0.06); tone(900, 0.05, 'triangle', 0.06, 0.03); },
  chime:  () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.5, 'sine', 0.09, i * 0.08)); },
  whoosh: () => tone(200, 0.35, 'sawtooth', 0.03, 0, 900),
  boing:  () => tone(180, 0.35, 'triangle', 0.14, 0, 420),
  oops:   () => { tone(330, 0.16, 'triangle', 0.1); tone(247, 0.22, 'triangle', 0.1, 0.12); },
  tada:   () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, i * 0.09)); },
  note:   (f = 440, d = 0.18) => tone(f, d, 'triangle', 0.12),
  drum:   (accent = false) => { tone(accent ? 110 : 160, accent ? 0.22 : 0.12, 'sine', accent ? 0.35 : 0.18, 0, 50); },
};
function sound(name, ...args){
  if (!FF('sound') || !SOUND_ON) return;
  const f = SOUNDS[name]; if (f) f(...args);
}

/* ══════════════════════════════════════════════════════════════════════════
   5. Voice. The browser's own speech synthesis — English for now.
   On by default for the Tiny and Explorer bands, off for the rest; the
   learner's choice is remembered per band.
   ══════════════════════════════════════════════════════════════════════════ */
const store = {
  get(k, d){ try { const v = localStorage.getItem('pg:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem('pg:' + k, JSON.stringify(v)); } catch (e) {} },
};
let BAND = null, THREAD = null, PART = null, VOICE_ON = false, VOICE = null;
function pickVoice(){
  if (!('speechSynthesis' in root)) return null;
  const vs = speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
  const pref = [/en-IN/i, /Google UK English Female/i, /Samantha/i, /Zira/i, /en-GB/i, /en-US/i];
  for (const p of pref) { const v = vs.find(v => p.test(v.lang) || p.test(v.name)); if (v) return v; }
  return vs[0] || null;
}
if ('speechSynthesis' in root) speechSynthesis.onvoiceschanged = () => { VOICE = pickVoice(); };
const plain = html => String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
/* say(text) speaks if voice is on. Returns a promise that settles when speech ends. */
function say(text, o = {}){
  if (!FF('voice') || !VOICE_ON || !('speechSynthesis' in root)) return Promise.resolve();
  return new Promise(res => {
    try {
      if (o.interrupt !== false) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plain(text));
      VOICE = VOICE || pickVoice();
      if (VOICE) u.voice = VOICE;
      u.lang = (VOICE && VOICE.lang) || 'en-IN';
      u.rate = o.rate || (BAND === 'tiny' ? 0.9 : 1);
      u.pitch = o.pitch || (BAND === 'tiny' ? 1.15 : 1);
      u.onend = u.onerror = () => res();
      speechSynthesis.speak(u);
      setTimeout(res, 12000);
    } catch (e) { res(); }
  });
}
const hush = () => { try { speechSynthesis.cancel(); } catch (e) {} };
// Speech must never outlive the page it belongs to: leaving, hiding or unloading the frame silences it.
root.addEventListener('pagehide', hush);
root.addEventListener('beforeunload', hush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hush(); });

/* ══════════════════════════════════════════════════════════════════════════
   6. Events — what the learner did, for the host LMS.

   The most valuable thing here is the PREDICTION: a class's predictions
   before they play are a misconception survey nobody had to set.
   ══════════════════════════════════════════════════════════════════════════ */
const EVENTS = [];
function track(type, data = {}){
  const ev = Object.assign({type, thread: THREAD, band: BAND, part: PART, t: Date.now()}, data);
  EVENTS.push(ev);
  if (FF('telemetry')) { try { parent.postMessage({type: 'playground:event', event: ev}, '*'); } catch (e) {} }
  return ev;
}

/* ══════════════════════════════════════════════════════════════════════════
   7. Toast and confetti.
   ══════════════════════════════════════════════════════════════════════════ */
let toastEl = null, toastT = 0;
function toast(html, ms = 2600){
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'pg-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.innerHTML = html;
  toastEl.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
}
/* A burst of paper from a screen point (or the centre). Cheap: one canvas, ~1.5 s. */
function confetti(x, y, n = 70){
  if (reduced()) return;
  const c = document.createElement('canvas'); c.className = 'pg-confetti';
  c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const g = c.getContext('2d'); g.scale(devicePixelRatio, devicePixelRatio);
  x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight / 2 : y;
  const cols = ['#ff7a2f', '#ffb400', '#2f9e5b', '#2f7de1', '#e0567a', '#8a5cf6'];
  const ps = Array.from({length: n}, () => ({x, y, vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 3,
    r: Math.random() * 6, s: 4 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)], w: Math.random() * 6}));
  const t0 = performance.now();
  const step = now => {
    const k = (now - t0) / 1500;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.15;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - k);
      g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 + Math.abs(Math.sin(p.w + now / 90)) * p.s / 2); g.restore();
    }
    if (k < 1) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

/* ══════════════════════════════════════════════════════════════════════════
   8. Findings — the things there are to discover on a page.

   A page declares them up front, so the tray shows empty slots from the
   start: children see there is more to find. Each is found by the MODEL
   reaching a state, never by pressing a "found it" button.
     findings(host, [{id, label, icon, say}])
     discover(id)        — idempotent
   Tiny and Explorer call them discoveries and celebrate; the older bands
   call them findings and just note them.
   ══════════════════════════════════════════════════════════════════════════ */
let FINDS = [], FOUND = new Set(), FIND_HOST = null, FIND_CB = null;
function findings(host, list, onAll){
  if (!FF('findings')) { FINDS = []; if (host) host.remove && host.closest('.card') && host.closest('.card').remove(); return; }
  FINDS = list; FIND_HOST = host; FIND_CB = onAll || null;
  renderFinds();
}
function renderFinds(popId){
  if (!FIND_HOST) return;
  const young = BAND === 'tiny' || BAND === 'explorer';
  FIND_HOST.innerHTML = `<div class="pg-count">${FOUND.size} of ${FINDS.length} ${young ? 'discoveries' : 'findings'}</div>
    <div class="pg-finds">${FINDS.map(f => {
      const got = FOUND.has(f.id);
      return `<span class="pg-find${got ? ' got' : ''}${f.id === popId ? ' pop' : ''}" title="${esc(got ? f.label : 'Not found yet')}">
        <i aria-hidden="true">${got ? (f.icon || '✓') : '?'}</i>${got ? esc(f.label) : (young ? '???' : esc(f.hint || 'Not found yet'))}</span>`;
    }).join('')}</div>`;
}
function discover(id, at){
  if (!FF('findings') || FOUND.has(id)) return false;
  const f = FINDS.find(f => f.id === id); if (!f) return false;
  FOUND.add(id);
  renderFinds(id);
  const young = BAND === 'tiny' || BAND === 'explorer';
  sound(young ? 'tada' : 'chime');
  toast(`${f.icon || '✓'} ${young ? 'You found it!' : 'Finding:'} <b>${esc(f.label)}</b>`);
  if (young) confetti(at && at.x, at && at.y, BAND === 'tiny' ? 90 : 60);
  if (f.say) say(f.say);
  track('finding', {id, label: f.label, count: FOUND.size, of: FINDS.length});
  if (FOUND.size === FINDS.length && FIND_CB) setTimeout(FIND_CB, 900);
  return true;
}
const found = id => FOUND.has(id);

/* ══════════════════════════════════════════════════════════════════════════
   9. Predict -> Play -> Explain.

   predict(host, {id, q, options: [{id, text, right}], confidence, onLock})
     Renders the question. The learner picks, says how sure they are, and
     locks it in. Nothing on the page should give the answer away before
     that — pages keep their revealing controls disabled until onLock.
   ctl.explain(html, rightOrNot)
     Called by the PAGE when the model has shown what happens. It shows the
     learner's own prediction beside what the model did.
   With the predict flag off, onLock(null) fires at once and nothing renders.
   ══════════════════════════════════════════════════════════════════════════ */
function predict(host, o){
  const ctl = {locked: false, choice: null, conf: null, explained: false, explain: () => {}};
  if (!FF('predict') || !host) { ctl.locked = true; setTimeout(() => o.onLock && o.onLock(null), 0); return ctl; }
  let pick = null, conf = null;
  const confs = ['Just guessing', 'Fairly sure', 'Certain'];
  host.classList.add('card', 'poe');
  const draw = () => {
    if (ctl.locked) {
      const opt = o.options.find(x => x.id === ctl.choice);
      host.classList.add('locked');
      host.innerHTML = `<div class="kicker">Your prediction</div><div class="mine">${opt ? opt.text : ''}
        ${ctl.conf != null ? `<div style="font-size:12px;color:var(--ink-3);margin-top:4px">${confs[ctl.conf]}</div>` : ''}</div>
        <div class="verdict-slot"></div>`;
      return;
    }
    host.innerHTML = `<div class="kicker">Predict first</div><div class="q">${o.q}</div>
      <div class="opts">${o.options.map(x => `<button class="opt" data-p="${esc(x.id)}" aria-pressed="${pick === x.id}">${x.text}</button>`).join('')}</div>
      ${o.confidence === false ? '' : `<div class="conf">How sure are you?
        ${confs.map((c, i) => `<button data-c="${i}" aria-pressed="${conf === i}">${c}</button>`).join('')}</div>`}
      <div class="row" style="margin-top:10px"><button class="btn primary" data-lock ${pick == null ? 'disabled' : ''}>Lock in my prediction</button></div>`;
  };
  host.addEventListener('click', e => {
    if (ctl.locked) return;
    const p = e.target.closest('[data-p]'), c = e.target.closest('[data-c]'), l = e.target.closest('[data-lock]');
    if (p) { pick = p.dataset.p; sound('tick'); draw(); }
    else if (c) { conf = +c.dataset.c; sound('tick'); draw(); }
    else if (l && pick != null) {
      ctl.locked = true; ctl.choice = pick; ctl.conf = conf;
      const opt = o.options.find(x => x.id === pick);
      track('prediction', {id: o.id, q: plain(o.q), choice: pick, text: plain(opt.text), confidence: conf, right: !!opt.right});
      sound('snap'); draw();
      o.onLock && o.onLock(pick);
    }
  });
  ctl.explain = (html, right) => {
    const slot = host.querySelector('.verdict-slot'); if (!slot) return;
    const opt = o.options.find(x => x.id === ctl.choice);
    const ok = right != null ? right : !!(opt && opt.right);
    slot.innerHTML = `<div class="verdict ${ok ? 'good' : 'rethink'}">${ok ? '<b>Your prediction held up.</b> ' : '<b>The model disagrees with your prediction.</b> '}${html}</div>`;
    if (!ctl.explained) track('explained', {id: o.id, predictionRight: ok});
    ctl.explained = true;
  };
  draw();
  return ctl;
}

/* ══════════════════════════════════════════════════════════════════════════
   10. Share a state as a link.
   ══════════════════════════════════════════════════════════════════════════ */
let SHARE_GET = null;
const shareState = get => { SHARE_GET = get; };
function sharedState(){
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { return null; }
}
async function copyLink(){
  if (!SHARE_GET) return;
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(SHARE_GET()))));
  const url = location.href.split('#')[0] + '#s=' + encodeURIComponent(s);
  try { await navigator.clipboard.writeText(url); toast('Link copied — it opens exactly this.'); }
  catch (e) { history.replaceState(null, '', url); toast('The link is in the address bar.'); }
  track('share');
}

/* ══════════════════════════════════════════════════════════════════════════
   11. The chrome: top bar with the class ladder, and the tools.

   mount({thread, band}) — call once, first thing in a page script. Sets the
   band on <body>, fills <header class="pg-top">, and wires the tools.
   ══════════════════════════════════════════════════════════════════════════ */
/* The chapter's own sequence: step 1, step 2, step 3, with the one you are on marked. */
function seqHTML(thread, band, part){
  const list = partList(thread, band);
  if (list.length < 2) return '';
  return `<nav class="pg-seq" aria-label="The steps of this chapter" title="${esc(list.map((p, i) => (i + 1) + '. ' + p.title).join('  ·  '))}">${list.map((p, i) => {
    const here = (p.id || null) === (part || null);
    /* Only the step you are on spells out its name; the others stay as numbers, or the top
       bar runs out of room and wraps the tools onto a second line. */
    const label = `<b>${i + 1}</b>${here ? `<span>${esc(p.title)}</span>` : ''}`;
    if (here) return `<span class="pg-step" aria-current="page">${label}</span>`;
    return p.built === false ? `<span class="pg-step off">${label}</span>`
      : `<a class="pg-step" href="${BASE}${pageOf(thread, band, p.id)}">${label}</a>`;
  }).join('')}</nav>`;
}

function ladderHTML(thread, current){
  const t = threadOf(thread);
  return `<nav class="pg-ladder" aria-label="${esc(t ? t.name : '')}, class by class">${BANDS.map(b => {
    const cls = `<span class="cls">${b.classes.map(c => `<span>${c}</span>`).join('')}</span><span class="bn">${b.name}</span>`;
    if (b.id === current) return `<span class="pg-rung" aria-current="page">${cls}</span>`;
    const st = t && t.steps[b.id];
    return st && st.built !== false ? `<a class="pg-rung" href="${BASE}${pageOf(thread, b.id)}" title="${esc(b.name + ': ' + st.title)}">${cls}</a>`
              : `<span class="pg-rung off">${cls}</span>`;
  }).join('')}</nav>`;
}
function mount(o){
  THREAD = o.thread; BAND = o.band; PART = o.part || null;
  document.body.dataset.band = BAND;
  const t = threadOf(THREAD), st = t && t.steps[BAND], b = bandOf(BAND);
  const me = partList(THREAD, BAND).find(p => (p.id || null) === PART) || {};
  VOICE_ON = store.get('voice:' + BAND, BAND === 'tiny' || BAND === 'explorer');
  SOUND_ON = store.get('sound', true);
  const top = document.querySelector('header.pg-top');
  if (top) {
    top.innerHTML = `<a class="pg-home" href="${BASE}index.html"><span class="dot"></span>Playground</a>
      <div class="pg-title"><small>${esc(t ? t.subject : '')} · ${esc(b ? b.name + ', Class ' + b.classes.join('–') : '')}</small>
        <b>${esc(me.title || (st ? st.title : ''))}</b></div>
      <span class="pg-sp"></span>
      ${ladderHTML(THREAD, BAND)}
      ${seqHTML(THREAD, BAND, PART)}
      <span class="pg-tools">
        ${FF('voice') && 'speechSynthesis' in root ? `<button class="pg-tool" id="pgVoice" aria-pressed="${VOICE_ON}" title="Read aloud">🔊<span>Voice</span></button>` : ''}
        ${FF('sound') ? `<button class="pg-tool" id="pgSound" aria-pressed="${SOUND_ON}" title="Sound effects">♪</button>` : ''}
        ${FF('share') ? `<button class="pg-tool" id="pgShare" title="Copy a link to exactly this">Share</button>` : ''}
        ${FF('present') ? `<button class="pg-tool" id="pgPresent" aria-pressed="false" title="Big screen for a classroom">Present</button>` : ''}
      </span>`;
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', () => fn(el)); };
    on('pgVoice', el => { VOICE_ON = !VOICE_ON; store.set('voice:' + BAND, VOICE_ON); el.setAttribute('aria-pressed', VOICE_ON); if (!VOICE_ON) hush(); else say('Voice is on.'); });
    on('pgSound', el => { SOUND_ON = !SOUND_ON; store.set('sound', SOUND_ON); el.setAttribute('aria-pressed', SOUND_ON); });
    on('pgShare', () => SHARE_GET ? copyLink() : toast('This page has nothing to share yet.'));
    on('pgPresent', el => {
      const p = !document.body.classList.contains('present');
      document.body.classList.toggle('present', p); el.setAttribute('aria-pressed', p);
      try { if (p && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else if (!p && document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
      track('present', {on: p});
      dispatchEvent(new Event('resize'));
    });
  }
  /* The syllabus line, from the one verified list. It replaces any .syl a page wrote itself. */
  const sy = syllabusOf(THREAD, BAND), intro = document.querySelector('.pg-intro');
  if (sy && intro) {
    let el = intro.querySelector('.syl');
    if (!el) { el = document.createElement('div'); intro.appendChild(el); }
    el.className = 'pg-syl';                 // drop the page's own .syl styling: one look everywhere
    el.innerHTML = sy.tags.map(t => `<span class="pg-syltag">${esc(t)}</span>`).join('') +
      (sy.note ? `<span class="pg-sylnote">${esc(sy.note)}</span>` : '');
  }
  /* The first gesture unlocks audio in every browser. */
  addEventListener('pointerdown', () => audio(), {once: true});
  track('open');
}

root.Play = {
  FEATURES, FEATURE_DEFAULTS, FF,
  BANDS, THREADS, bandOf, bandForClass, threadOf, pageOf, partsOf, partList, BASE, SYLLABUS, syllabusOf,
  $, $$, esc, clamp, lerp, fmt, mulberry32, reduced, ease, loop, clock, tween, sleep,
  svgPoint, drag,
  sound, tone, say, hush, get voiceOn(){ return VOICE_ON && FF('voice'); }, get soundOn(){ return SOUND_ON && FF('sound'); },
  track, EVENTS, toast, confetti,
  findings, discover, found,
  predict,
  shareState, sharedState,
  mount, ladderHTML, store,
};
})(window);
