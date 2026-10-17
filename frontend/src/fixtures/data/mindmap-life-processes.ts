import { A, S, T, type ChapterSeed } from './mindmap-seed';

export const LIFE_PROCESSES: ChapterSeed = {
  paraphrased: 'Anaerobic respiration',
  topics: [
    T('What Defines Life?', 93, [
      S('Signs of life', [
        A('Living organism', 'd', 'Living things show some form of movement at the molecular level, even when no visible movement can be seen.', {
          note: 'Start from the sleeping-dog example: still alive, because molecules inside are moving all the time.',
        }),
        A('Molecular movement', 'e', 'Molecular movements are needed all the time for living organisms to maintain their structures.'),
      ]),
      S('Viruses as a boundary case', [
        A('Viruses', 'x', 'Viruses show no molecular movement until they infect a cell, which is why it is debated whether they are truly alive.', {
          ex: 'Why is it controversial to call viruses living organisms?',
        }),
      ]),
    ]),
    T('Life Processes as Maintenance', 93, [
      S('Why maintenance is needed', [
        A('Maintenance', 'd', 'Living structures are highly organised and tend to break down over time, so they need constant repair and maintenance.'),
        A('Life processes', 'd', 'The processes which together perform the maintenance job of a living organism are called life processes.', {
          pyq: [[2020, 1, 'What are life processes? Name any two.']],
          note: 'Board answers expect the definition word for word, then nutrition, respiration, transport and excretion as examples.',
        }),
      ]),
      S('Energy and raw material', [
        A('Energy for maintenance', 'e', 'Maintenance processes need energy, and this energy comes from outside the body of the individual organism.'),
        A('Growth', 'd', 'Growth needs raw materials from outside the organism in addition to energy.'),
      ]),
    ]),
    T('Nutrition and Energy Sources', 94, [
      S('Taking in energy', [
        A('Nutrition', 'd', 'The process of transferring a source of energy from outside the body of the organism to the inside is called nutrition.', {
          pyq: [[2019, 1, 'Define nutrition.']],
        }),
        A('Food', 'd', 'Food is the source of energy and materials that an organism takes in from outside its body.'),
      ]),
      S('Chemistry of food', [
        A('Carbon-based molecules', 'd', 'Since life on Earth depends on carbon-based molecules, most food sources are also carbon-based.'),
        A('Oxidation of food', 'p', 'Food molecules are broken down inside cells by oxidising-reducing reactions to release energy.'),
      ]),
    ]),
    T('Nutrition in Autotrophs', 94, [
      S('Who makes food', [
        A('Autotrophic nutrition', 'd', 'Autotrophic nutrition is the mode in which organisms make their own food from simple substances.', {
          pyq: [[2023, 2, 'What is autotrophic nutrition? Name two raw materials it needs.']],
          note: 'Pair this with heterotrophic nutrition in every answer; the board likes the contrast.',
        }),
        A('Autotroph', 'd', 'Green plants and some bacteria are autotrophs: they use carbon dioxide and water to make carbohydrates.'),
      ]),
      S('What is made and stored', [
        A('Carbohydrates', 'd', 'Carbohydrates made by autotrophs are used to provide energy to the plant.'),
        A('Starch', 'd', 'Carbohydrates which are not used immediately are stored in the form of starch, which serves as the internal energy reserve.', {
          ex: 'In what form do plants store food, and why is it useful?',
        }),
        A('Glycogen', 'x', 'In our bodies, some of the energy from the food we eat is stored in the form of glycogen.'),
      ]),
    ]),
    T('Chloroplast Structure and Function', 95, [
      S('The organelle', [
        A('Chloroplast', 'd', 'Chloroplasts are the cell organelles in leaf cells that contain chlorophyll.', {
          pyq: [[2024, 1, 'Which cell organelle is the site of photosynthesis? (a) mitochondrion (b) chloroplast (c) nucleus (d) ribosome']],
        }),
        A('Mesophyll cells', 'g', 'The cells of the leaf just below the upper surface are packed with chloroplasts, the green dots seen under the microscope.'),
      ]),
      S('The pigment', [
        A('Chlorophyll', 'd', 'Chlorophyll is the pigment that absorbs light energy in the leaf.', {
          pyq: [[2022, 1, 'Name the pigment that absorbs light energy during photosynthesis.']],
          note: 'Chlorophyll absorbs the light; the chloroplast is the organelle. Students mix these up every year.',
        }),
      ]),
    ]),
    T('Photosynthesis Processes', 95, [
      S('The overall reaction', [
        A('Photosynthesis', 'd', 'Photosynthesis is the process by which autotrophs take in substances from outside and convert them into stored forms of energy.', {
          pyq: [
            [2023, 3, 'List the three events that occur during photosynthesis. Write the balanced equation for the process.'],
            [2020, 2, 'Why is photosynthesis called an anabolic process?'],
          ],
          ex: 'A plant is kept in the dark for 24 hours and then in sunlight. Which test would show that photosynthesis has occurred?',
          note: 'Write the three events in order, then the equation. Most lost marks are from swapping the second and third events.',
        }),
        A('Photosynthesis equation', 'f', '6CO2 + 12H2O, in the presence of chlorophyll and sunlight, gives C6H12O6 + 6O2 + 6H2O.', {
          pyq: [[2019, 2, 'Write the balanced chemical equation for photosynthesis.']],
        }),
      ]),
      S('The three events', [
        A('Light absorption', 'p', 'Light energy is absorbed by chlorophyll in the first event of photosynthesis.'),
        A('Splitting of water', 'p', 'Light energy is converted to chemical energy and water molecules are split into hydrogen and oxygen.'),
        A('Reduction of carbon dioxide', 'p', 'Carbon dioxide is reduced to carbohydrates in the last event of photosynthesis.'),
      ], 'These steps need not take place one after the other immediately.'),
      S('Variations in plants', [
        A('Desert plants', 'a', 'Desert plants take up carbon dioxide at night and prepare an intermediate which is acted upon by the energy absorbed by chlorophyll during the day.', {
          ex: 'How do desert plants perform photosynthesis if their stomata stay closed during the day?',
        }),
      ]),
    ]),
    T('Starch Detection in Leaves', 96, [
      S('Preparing the leaf', [
        A('Destarching', 'p', 'A potted plant kept in a dark room for three days uses up the starch stored in its leaves.'),
        A('Variegated leaf', 'g', 'A variegated leaf has green and white patches, so only parts of it contain chlorophyll.', {
          pyq: [[2021, 3, 'Describe an activity to show that chlorophyll is necessary for photosynthesis.']],
        }),
      ]),
      S('Testing and concluding', [
        A('Iodine test', 'p', 'A leaf that turns blue-black when a few drops of iodine solution are added shows that starch is present.'),
        A('Chlorophyll is necessary', 'l', 'Only the green parts of a variegated leaf turn blue-black, which shows that chlorophyll is necessary for photosynthesis.', {
          note: 'Draw the leaf before and after the test. Two diagrams earn the third mark.',
        }),
      ]),
    ]),
    T('Carbon Dioxide Uptake Mechanisms', 96, [
      S('The pores', [
        A('Stomata', 'd', 'Stomata are tiny pores present on the surface of the leaf through which gases are exchanged.', {
          pyq: [
            [2024, 2, 'State two functions of stomata.'],
            [2019, 1, 'Name the cells that control the opening and closing of stomata.'],
          ],
        }),
        A('Gaseous exchange in leaves', 'p', 'Massive amounts of gaseous exchange take place in the leaves through these pores for the purpose of photosynthesis.'),
      ]),
      S('Opening and closing', [
        A('Guard cells', 'd', 'The guard cells swell when water flows into them, causing the stomatal pore to open.'),
        A('Stomatal closing', 'e', 'The pore closes if the guard cells shrink, and the plant closes these pores when it does not need carbon dioxide.', {
          note: 'Closing stomata saves water. Link this to transpiration when you revise transport.',
        }),
      ]),
    ]),
    T('Heterotrophic Nutrition', 96, [
      S('Depending on others', [
        A('Heterotroph', 'd', 'Heterotrophs are organisms that depend directly or indirectly on autotrophs for their food.'),
        A('Heterotrophic nutrition', 'd', 'In heterotrophic nutrition, organisms take in complex food made by other organisms.', {
          pyq: [[2022, 2, 'Distinguish between autotrophic and heterotrophic nutrition.']],
        }),
      ]),
      S('Why it varies', [
        A('Food intake depends on body design', 'e', 'Each organism is adapted to its environment, so the form of nutrition differs with the type and availability of food.'),
      ]),
    ]),
    T('Mechanisms of Nutrition in Organisms', 96, [
      S('Outside or inside the body', [
        A('Breakdown outside the body', 'p', 'Some organisms break down the food material outside the body and then absorb it.'),
        A('Ingestion of whole material', 'p', 'Other organisms take in whole material and break it down inside their bodies.'),
      ]),
      S('Single-celled organisms', [
        A('Amoeba', 'p', 'Amoeba takes in food using temporary finger-like extensions of the cell surface which fuse over the food particle, forming a food vacuole.', {
          pyq: [[2020, 3, 'Describe with a labelled diagram how Amoeba obtains its food.']],
          ex: 'Which structure in Amoeba is used to capture food?',
        }),
        A('Food vacuole', 'd', 'Inside the food vacuole, complex substances are broken down into simpler ones which then diffuse into the cytoplasm.'),
        A('Paramoecium', 'x', 'In Paramoecium, which has a definite shape, food is taken in at a specific spot and moved there by cilia.'),
      ]),
    ]),
    T('Nutrition Types', 96, [
      S('Heterotrophic modes', [
        A('Saprophytic nutrition', 'd', 'Organisms like fungi break down food material outside the body and then absorb it; this is saprophytic nutrition.'),
        A('Parasitic nutrition', 'd', 'Some organisms derive nutrition from plants or animals without killing them; this is parasitic nutrition.', {
          pyq: [[2021, 1, 'Give one example of an organism that shows parasitic nutrition.']],
        }),
        A('Holozoic nutrition', 'd', 'In holozoic nutrition, the organism takes in whole food and digests it inside its body.'),
      ]),
      S('Examples', [
        A('Cuscuta', 'a', 'Cuscuta, the amar-bel, is a parasitic plant that draws its nutrition from the host plant.'),
        A('Ticks and lice', 'a', 'Ticks, lice, leeches and tape-worms are parasites that live on or in their hosts.'),
        A('Fungi', 'a', 'Bread moulds, yeast and mushrooms are fungi that obtain food by breaking it down outside the body.'),
      ]),
    ], 'top_dev_modes_of_nutrition'),
    T('Nutrition in Human Beings', 98, [
      S('The alimentary canal', [
        A('Alimentary canal', 'd', 'The alimentary canal is basically a long tube extending from the mouth to the anus.', {
          note: 'Learn the order mouth, oesophagus, stomach, small intestine, large intestine, anus before any enzyme.',
        }),
        A('Mouth', 'p', 'In the mouth, food is crushed by the teeth and mixed with saliva with the help of the muscular tongue.'),
      ]),
      S('Chewing and moistening', [
        A('Teeth', 'd', 'Teeth chew and grind the food into small pieces so that it can be swallowed and digested.'),
        A('Saliva', 'd', 'The salivary glands secrete saliva, which moistens the food and starts its digestion.'),
      ]),
    ]),
    T('Digestion and Enzymes', 99, [
      S('What enzymes are', [
        A('Enzyme', 'd', 'Enzymes are biological catalysts that break down complex molecules of food into simpler ones.', {
          ex: 'What would happen to digestion if the gastric glands stopped secreting enzymes?',
        }),
      ]),
      S('Enzymes of the mouth and stomach', [
        A('Salivary amylase', 'd', 'Saliva contains an enzyme called salivary amylase that breaks down starch into simple sugar.', {
          pyq: [[2024, 1, 'Which enzyme in saliva acts on starch? (a) pepsin (b) trypsin (c) salivary amylase (d) lipase']],
        }),
        A('Pepsin', 'd', 'Pepsin is the protein-digesting enzyme secreted by the gastric glands.'),
      ]),
      S('Enzymes of the small intestine', [
        A('Trypsin', 'd', 'The pancreas secretes pancreatic juice which contains trypsin for digesting proteins.'),
        A('Lipase', 'd', 'Lipase in the pancreatic juice breaks down emulsified fats.'),
        A('Bile', 'd', 'Bile juice from the liver makes the medium alkaline and breaks large fat globules into smaller ones.', {
          pyq: [[2023, 2, 'State two functions of bile juice.']],
          note: 'Bile has no enzyme. Emulsification is physical; write that explicitly.',
        }),
      ]),
    ]),
    T('Digestive Tract and Movement', 99, [
      S('Moving food along', [
        A('Peristalsis', 'p', 'The lining of the canal has muscles that contract rhythmically to push the food forward; these movements are called peristalsis.', {
          pyq: [[2019, 1, 'What is peristalsis?']],
        }),
        A('Oesophagus', 'd', 'The oesophagus carries food from the mouth to the stomach.'),
      ]),
      S('The stomach', [
        A('Stomach', 'd', 'The stomach is a large organ which expands when food enters it.'),
        A('Sphincter muscle', 'd', 'The exit of food from the stomach into the small intestine is regulated by a sphincter muscle.'),
      ]),
    ]),
    T('Small Intestine and Absorption', 100, [
      S('Completing digestion', [
        A('Small intestine', 'd', 'The small intestine is the longest part of the alimentary canal and the site of complete digestion of carbohydrates, proteins and fats.'),
        A('Intestinal juice', 'd', 'The walls of the small intestine contain glands which secrete intestinal juice that completes digestion.'),
      ]),
      S('Absorbing food', [
        A('Villi', 'd', 'The inner lining of the small intestine has numerous finger-like projections called villi which increase the surface area for absorption.', {
          pyq: [
            [2023, 2, 'How are villi adapted for absorption of digested food?'],
            [2020, 1, 'Name the finger-like projections in the small intestine.'],
          ],
          note: 'Two adaptations for two marks: large surface area, and a rich supply of blood vessels.',
        }),
        A('Absorption', 'p', 'The digested food is taken up by the walls of the intestine and carried by blood to each and every cell of the body.'),
      ]),
      S('Diet and gut length', [
        A('Length and diet', 'x', 'Herbivores eating grass need a longer small intestine to digest cellulose, while carnivores eating meat have a shorter one.', {
          ex: 'Why is the small intestine of a cow longer than that of a tiger?',
        }),
      ]),
    ]),
    T('Human Digestion', 100, [
      S('Stomach secretions', [
        A('Gastric glands', 'd', 'The gastric glands in the wall of the stomach release hydrochloric acid, the protein-digesting enzyme pepsin, and mucus.'),
        A('Hydrochloric acid', 'd', 'Hydrochloric acid creates an acidic medium in the stomach which facilitates the action of pepsin.', {
          pyq: [[2022, 1, 'Which substance in the stomach kills bacteria that enter with food?']],
        }),
        A('Mucus', 'd', 'Mucus protects the inner lining of the stomach from the action of the acid under normal conditions.'),
      ]),
      S('The end of the canal', [
        A('Large intestine', 'd', 'The unabsorbed food is sent into the large intestine, where more villi absorb water from this material.'),
        A('Egestion', 'p', 'The exit of the waste material from the body is regulated by the anal sphincter.'),
      ]),
      S('Care of the mouth', [
        A('Dental caries', 'e', 'Bacteria acting on sugars produce acids that soften the enamel and cause tooth decay, called dental caries.'),
      ]),
    ]),
    T('Respiration and Oxygen Use', 101, [
      S('Releasing energy', [
        A('Respiration', 'd', 'Respiration is the process by which food is broken down in cells to provide energy for life processes.'),
      ]),
      S('With and without oxygen', [
        A('Aerobic respiration', 'd', 'Aerobic respiration takes place in the presence of oxygen and releases a greater amount of energy.', {
          pyq: [
            [2024, 3, 'Compare aerobic and anaerobic respiration, giving one example of where each happens in living things.'],
            [2021, 2, 'Why does aerobic respiration release more energy than anaerobic respiration?'],
          ],
          note: 'Use a three-column table: where, products, energy. It answers both the 2 and 3 mark versions.',
        }),
        A('Anaerobic respiration', 'd', 'In the absence of oxygen, glucose is broken down into ethanol and carbon dioxide.', {
          pyq: [[2022, 1, 'Name the products of anaerobic respiration in yeast.']],
        }),
        A('Mitochondria', 'd', 'The break-down of pyruvate using oxygen takes place in the mitochondria.', {
          pyq: [[2023, 1, 'In which part of a cell does the breakdown of pyruvate into carbon dioxide and water take place?']],
        }),
      ]),
    ], 'top_dev_respiration'),
    T('Cellular Respiration Processes', 101, [
      S('In the cytoplasm', [
        A('Glycolysis', 'p', 'The first step, the break-down of glucose, a six-carbon molecule, into a three-carbon molecule called pyruvate takes place in the cytoplasm.'),
        A('Pyruvate', 'd', 'Pyruvate is the three-carbon molecule formed when glucose is broken down.'),
      ]),
      S('When oxygen runs short', [
        A('Lactic acid', 'e', 'When there is a lack of oxygen in our muscle cells, pyruvate is converted into lactic acid, which is also a three-carbon molecule.'),
        A('Muscle cramps', 'a', 'The build-up of lactic acid in our muscles during sudden activity causes cramps.', {
          pyq: [[2020, 2, 'Why do we get muscle cramps after vigorous exercise?']],
        }),
      ]),
      S('In yeast', [
        A('Fermentation', 'p', 'In yeast, pyruvate is converted into ethanol and carbon dioxide; this process is fermentation.'),
      ]),
    ]),
    T('ATP and Cellular Energy', 102, [
      S('The energy currency', [
        A('ATP', 'd', 'The energy released during cellular respiration is immediately used to synthesise a molecule called ATP, the energy currency for most cellular processes.', {
          pyq: [[2019, 1, 'What is the full form of ATP?']],
        }),
        A('ADP', 'd', 'ATP is made from ADP and inorganic phosphate using the energy released in respiration.'),
      ]),
      S('What ATP is used for', [
        A('Uses of ATP', 'a', 'The energy of ATP is used for muscle contraction, protein synthesis and the conduction of nervous impulses.'),
      ]),
    ]),
    T('Testing Carbon Dioxide in Exhaled Air', 101, [
      S('The test', [
        A('Lime water test', 'p', 'Lime water turns milky when carbon dioxide is passed through it.'),
        A('Exhaled air', 'n', 'The air we breathe out contains more carbon dioxide than the air around us.'),
      ]),
      S('Yeast activity', [
        A('Yeast fermentation experiment', 'p', 'Fruit juice or sugar solution with yeast in a sealed tube releases carbon dioxide that turns lime water milky.', {
          ex: 'Design an experiment to show that yeast releases carbon dioxide during respiration.',
        }),
      ]),
    ]),
    T('Gas Exchange in Animals', 102, [
      S('In water', [
        A('Gills', 'd', 'Fish take in water through their mouths and force it past the gills, where the dissolved oxygen is taken up by blood.'),
        A('Rate of breathing in water', 'e', 'Since the amount of dissolved oxygen is fairly low compared to the amount of oxygen in the air, the rate of breathing in aquatic organisms is much faster than in terrestrial organisms.', {
          pyq: [[2023, 2, 'Why is the rate of breathing in aquatic organisms much faster than in terrestrial organisms?']],
        }),
      ]),
      S('The air passage', [
        A('Nostrils', 'd', 'Air is taken into the body through the nostrils, where fine hairs and mucus filter it.'),
        A('Trachea', 'd', 'Rings of cartilage present in the throat ensure that the air-passage does not collapse.'),
        A('Cilia', 'd', 'The passage is lined with hair-like cilia that help remove germs, dust and other harmful particles from the inhaled air.'),
      ]),
      S('The lungs', [
        A('Lungs', 'd', 'Within the lungs, the passage divides into smaller and smaller tubes which finally terminate in balloon-like structures.'),
        A('Alveoli', 'd', 'The alveoli provide a surface where the exchange of gases can take place, and their walls contain an extensive network of blood vessels.', {
          pyq: [
            [2024, 2, 'How are the alveoli designed to maximise the exchange of gases?'],
            [2021, 3, 'Draw a diagram of the human respiratory system and label the alveoli and the trachea.'],
          ],
          note: 'If the alveolar surface were spread out it would cover about 80 square metres. Quote the number; it lands the mark.',
        }),
        A('Diaphragm', 'p', 'When we breathe in, we lift our ribs and flatten our diaphragm, and the chest cavity becomes larger.'),
        A('Residual volume', 'n', 'During the breathing cycle the lungs always contain a residual volume of air so that there is time for oxygen to be absorbed.'),
      ]),
    ]),
    T('Gas Exchange in Plants', 102, [
      S('How plants exchange gases', [
        A('Diffusion in plants', 'p', 'In plants, the exchange of gases takes place by diffusion through stomata in leaves and lenticels in stems.'),
      ]),
      S('Day and night', [
        A('Night-time respiration', 'e', 'At night, when there is no photosynthesis occurring, carbon dioxide elimination is the major exchange activity.'),
        A('Daytime exchange', 'e', 'During the day, carbon dioxide generated in respiration is used up for photosynthesis, so there is no release and oxygen release is the major event.', {
          ex: 'Why do plants release oxygen in the day and carbon dioxide at night?',
        }),
      ]),
    ]),
    T('Health Impacts of Tobacco Use', 102, [
      S('What smoking damages', [
        A('Smoking', 'e', 'Smoking destroys the cilia in the upper part of the respiratory tract, so germs, dust and smoke enter the lungs.', {
          note: 'Write the chain: smoke kills cilia, particles reach the lungs, infection, cough, cancer.',
        }),
        A('Lung cancer', 'e', 'Smoking is a major cause of diseases such as lung cancer, heart disease, emphysema and coronary heart disease.'),
      ]),
    ]),
    T('Respiratory Pigments', 103, [
      S('Carrying oxygen', [
        A('Haemoglobin', 'd', 'In human beings, the respiratory pigment is haemoglobin, which has a very high affinity for oxygen.', {
          pyq: [[2022, 1, 'Name the respiratory pigment in human beings.']],
        }),
        A('Red blood corpuscles', 'd', 'Haemoglobin is present in the red blood corpuscles, which take up oxygen from the air in the lungs.'),
      ]),
      S('Carrying carbon dioxide', [
        A('Carbon dioxide transport', 'p', 'Carbon dioxide is more soluble in water than oxygen is and hence is mostly transported in the dissolved form in our blood.'),
      ]),
    ]),
    T('Transportation and Excretion', 103, [
      S('Why a transport system', [
        A('Transport system', 'd', 'A transport system carries food and oxygen to every cell of the body and carries wastes away.'),
        A('Diffusion limits', 'e', 'Diffusion is too slow to meet the oxygen requirements of a multicellular organism, because all its cells are not in direct contact with the environment.'),
      ]),
    ]),
    T('Transportation in Human Beings', 103, [
      S('The fluid', [
        A('Blood', 'd', 'Blood is a fluid connective tissue that carries substances from one place to another.'),
        A('Plasma', 'd', 'Plasma is the fluid medium of blood that transports food, carbon dioxide and nitrogenous wastes in dissolved form.'),
      ]),
      S('The system', [
        A('Circulatory system', 'd', 'The heart, the blood vessels and the blood together form the circulatory system.'),
        A('Pumping organ', 'e', 'We need a pumping organ to push blood around the body, a network of tubes to reach all the tissues, and a system to repair the tubes if damaged.'),
      ]),
    ], 'top_dev_transportation'),
    T('Double Circulation', 105, [
      S('Two circuits', [
        A('Double circulation', 'd', 'Blood goes through the heart twice during each cycle in birds and mammals; this is called double circulation.', {
          pyq: [
            [2024, 3, 'What is double circulation? Why is it necessary in birds and mammals?'],
            [2020, 2, 'Explain why the heart has four chambers in mammals and birds.'],
          ],
          note: 'Trace one drop of blood: body, right atrium, right ventricle, lungs, left atrium, left ventricle, body.',
        }),
        A('Pulmonary circulation', 'p', 'Deoxygenated blood is pumped from the right ventricle to the lungs for oxygenation.'),
        A('Systemic circulation', 'p', 'Oxygenated blood is pumped from the left ventricle to the rest of the body.'),
      ]),
    ]),
    T('Structure and Function of the Heart', 104, [
      S('The chambers', [
        A('Heart', 'd', 'The heart is a muscular organ which is as big as our fist.'),
        A('Atrium', 'd', 'The atria are the thin-walled upper chambers of the heart that collect blood.'),
        A('Ventricle', 'd', 'Ventricles have thicker muscular walls than atria since they have to pump blood into various organs.', {
          ex: 'Why are the walls of the ventricles thicker than those of the atria?',
        }),
      ]),
      S('Keeping blood apart', [
        A('Valves', 'd', 'Valves ensure that blood does not flow backwards when the atria or ventricles contract.'),
        A('Four-chambered heart', 'e', 'The separation of the right side and the left side of the heart keeps oxygenated and deoxygenated blood from mixing.'),
        A('Three-chambered heart', 'x', 'Amphibians and many reptiles have three-chambered hearts and tolerate some mixing of the oxygenated and deoxygenated blood streams.'),
      ]),
      S('Into and out of the heart', [
        A('Pulmonary vein', 'd', 'Oxygen-rich blood from the lungs comes to the thin-walled upper chamber of the heart on the left, the left atrium, through the pulmonary vein.', {
          pyq: [[2023, 1, 'Which blood vessel brings oxygenated blood from the lungs to the heart?']],
        }),
        A('Aorta', 'd', 'The left ventricle pumps oxygen-rich blood out to the body through the aorta.'),
        A('Vena cava', 'd', 'Deoxygenated blood from the body reaches the right atrium through the vena cava.'),
      ]),
    ]),
    T('Blood Composition and Transport', 103, [
      S('What blood carries', [
        A('Blood cells', 'd', 'Blood consists of a fluid medium called plasma in which cells are suspended.'),
        A('Platelets', 'd', 'Platelet cells circulate around the body and plug leaks by helping to clot the blood at the point of injury.'),
      ]),
      S('Transport duties', [
        A('Transport of hormones', 'a', 'Blood carries hormones from the glands that secrete them to the organs on which they act.'),
        A('Nitrogenous wastes in blood', 'a', 'Blood carries nitrogenous wastes such as urea from the cells to the kidneys.'),
      ]),
    ]),
    T('Blood Pressure and Vessels', 106, [
      S('The tubes', [
        A('Arteries', 'd', 'Arteries carry blood away from the heart to various organs, and have thick, elastic walls because the blood emerges under high pressure.', {
          pyq: [[2024, 2, 'State two differences between arteries and veins.']],
        }),
        A('Veins', 'd', 'Veins collect the blood from different organs and bring it back to the heart; they have valves that ensure the blood flows only in one direction.'),
        A('Capillaries', 'd', 'The smallest vessels, the capillaries, have walls one cell thick, and the exchange of material between blood and surrounding cells takes place across them.'),
      ]),
      S('Pressure', [
        A('Blood pressure', 'd', 'The force that blood exerts against the wall of a vessel is called blood pressure.'),
        A('Systolic pressure', 'n', 'The normal systolic pressure is about 120 mm of Hg and the diastolic pressure is about 80 mm of Hg.', {
          pyq: [[2021, 1, 'What is the normal value of systolic and diastolic blood pressure in an adult?']],
        }),
        A('Hypertension', 'e', 'High blood pressure, also called hypertension, is caused by the constriction of arterioles and can lead to the rupture of an artery.'),
        A('Sphygmomanometer', 'a', 'Blood pressure is measured with an instrument called a sphygmomanometer.'),
      ]),
    ]),
    T('Blood Coagulation and Lymph', 107, [
      S('Stopping blood loss', [
        A('Clotting', 'p', 'Platelets help the blood to clot at the point of injury, which stops the loss of blood.'),
      ]),
      S('Lymph', [
        A('Lymph', 'd', 'Lymph, or tissue fluid, is a colourless fluid that escapes through the pores of capillaries into the intercellular spaces.', {
          pyq: [[2022, 2, 'What is lymph? State two of its functions.']],
        }),
        A('Lymphatic vessels', 'd', 'Lymph drains into lymphatic capillaries, which join to form large lymph vessels that open into larger veins.'),
        A('Fat absorption by lymph', 'a', 'Lymph carries digested and absorbed fat from the intestine and drains excess fluid back into the blood.'),
      ]),
    ]),
    T('Energy Needs and Transport Systems', 105, [
      S('Animals', [
        A('Warm-blooded animals', 'e', 'Birds and mammals constantly use energy to maintain their body temperature, so they need a highly efficient supply of oxygen.'),
        A('Cold-blooded animals', 'x', 'Animals whose body temperature depends on the temperature of the environment can tolerate some mixing of blood in the heart.'),
      ]),
      S('Plants', [
        A('Energy need of plants', 'x', 'Plants do not move, and plant bodies have a large proportion of dead cells, so they have low energy needs and can use slow transport systems.'),
      ]),
    ]),
    T('Transportation in Plants', 107, [
      S('Vascular tissue', [
        A('Vascular tissue', 'd', 'Xylem and phloem together form the vascular tissue, the conducting tissue of a plant.'),
        A('Xylem', 'd', 'Xylem carries water and minerals from the soil to the rest of the plant.', {
          pyq: [[2023, 1, 'Name the tissue that carries water and minerals from the roots to the leaves.']],
        }),
      ]),
      S('Moving water up', [
        A('Root pressure', 'e', 'Cells of the roots take up ions from the soil, creating a difference in ion concentration that draws water into the root.'),
        A('Water column', 'p', 'The interconnected vessels and tracheids of the xylem form a continuous column of water from the roots to the leaves.'),
      ]),
    ]),
    T('Transpiration and Water Uptake', 107, [
      S('Losing water', [
        A('Transpiration', 'd', 'The loss of water in the form of vapour from the aerial parts of the plant is known as transpiration.', {
          pyq: [
            [2024, 2, 'What is transpiration? Give two of its functions.'],
            [2019, 1, 'Name the process by which plants lose water as vapour from their leaves.'],
          ],
          note: 'Function list: water and mineral uptake, upward movement, temperature regulation. Any two for two marks.',
        }),
        A('Transpiration pull', 'e', 'Evaporation of water from the leaves creates a suction which pulls water from the xylem cells of the roots.'),
      ]),
      S('Uses and timing', [
        A('Temperature regulation', 'a', 'Transpiration helps in the absorption and upward movement of water and minerals, and in temperature regulation.'),
        A('Night-time water movement', 'x', 'At night, root pressure is especially important in moving water up the xylem, while transpiration pull is the main force in the day.'),
      ]),
    ]),
    T('Phloem Transport and Translocation', 107, [
      S('What phloem moves', [
        A('Phloem', 'd', 'Phloem transports the products of photosynthesis from the leaves to other parts of the plant.', {
          pyq: [[2021, 1, 'Name the tissue that transports food in plants.']],
        }),
        A('Translocation', 'd', 'The transport of soluble products of photosynthesis is called translocation and it occurs in the part of the vascular tissue known as phloem.'),
      ]),
      S('How it moves', [
        A('Sieve tubes', 'd', 'Translocation takes place in the sieve tubes with the help of adjacent companion cells, both upward and downward.'),
        A('Sucrose transport', 'p', 'Sucrose is transferred into phloem tissue using energy from ATP, which increases the osmotic pressure and moves material to tissues with less pressure.', {
          ex: 'Translocation of food in phloem needs energy, but transport of water in xylem does not. Explain.',
        }),
      ]),
    ]),
    T('Excretion in General', 108, [
      S('What excretion is', [
        A('Excretion', 'd', 'The biological process involved in the removal of these harmful metabolic wastes from the body is called excretion.', {
          pyq: [[2020, 1, 'Define excretion.']],
        }),
        A('Nitrogenous wastes', 'd', 'Nitrogenous materials such as urea or uric acid are produced when proteins are broken down.'),
      ]),
      S('In single cells', [
        A('Unicellular excretion', 'a', 'Many unicellular organisms remove these wastes by simple diffusion from the body surface into the surrounding water.'),
      ]),
    ]),
    T('Excretion in Human Beings', 108, [
      S('The organs', [
        A('Kidney', 'd', 'The kidney is the excretory organ in which the filtration of blood takes place.'),
        A('Ureter', 'd', 'Urine produced in the kidneys passes through the ureters into the urinary bladder.'),
        A('Urinary bladder', 'd', 'Urine is stored in the urinary bladder until the pressure of the expanded bladder leads to the urge to pass it out through the urethra.'),
      ]),
      S('The filtration unit', [
        A('Nephron', 'd', 'The nephron is the filtration unit packed in large numbers inside each kidney.', {
          pyq: [
            [2024, 3, 'Describe how urine is formed in a nephron, and state how the amount of urine produced is regulated.'],
            [2022, 1, 'Name the basic filtration unit of the kidney.'],
            [2019, 3, 'Draw a labelled diagram of a nephron.'],
          ],
          ex: 'Which part of the nephron would be affected if glucose appeared in the urine of a healthy-looking person?',
          note: 'Label in this order: glomerulus, Bowman’s capsule, tubule, collecting duct. The board scheme marks the order of filtration then reabsorption.',
        }),
        A('Glomerulus', 'd', 'The glomerulus is a cluster of very thin-walled blood capillaries where blood is filtered.'),
        A("Bowman's capsule", 'd', 'Each capillary cluster in the kidney is associated with the cup-shaped end of a coiled tube called Bowman’s capsule that collects the filtrate.'),
      ]),
      S('Forming urine', [
        A('Selective reabsorption', 'p', 'Substances like glucose, amino acids, salts and a major amount of water are selectively reabsorbed as the urine flows along the tube.'),
        A('Regulation of urine', 'e', 'The amount of water reabsorbed depends on how much excess water there is in the body and how much dissolved waste is to be excreted.'),
      ]),
      S('When kidneys fail', [
        A('Dialysis', 'a', 'An artificial kidney removes nitrogenous waste products from the blood through dialysis.', {
          pyq: [[2021, 2, 'How does an artificial kidney work?']],
        }),
      ]),
    ], 'top_dev_excretion'),
    T('Excretion in Plants', 110, [
      S('Getting rid of gases and water', [
        A('Oxygen as waste', 'd', 'Oxygen itself can be thought of as a waste product generated during photosynthesis.'),
        A('Excess water loss', 'p', 'Plants get rid of excess water by transpiration.'),
      ]),
      S('Storing wastes', [
        A('Leaf fall', 'p', 'Many plant waste products are stored in leaves that fall off.'),
        A('Resins and gums', 'd', 'Other waste products are stored as resins and gums, especially in old xylem.'),
        A('Vacuole storage', 'p', 'Some waste products are stored in cellular vacuoles, and some are excreted into the soil around the plant.', {
          ex: 'List three ways in which plants get rid of their excretory products.',
        }),
      ]),
    ]),
    T('Organ Donation', 109, [
      S('Giving organs', [
        A('Organ donation', 'd', 'Organ donation is a generous act of donating an organ to a person who suffers from non-functioning organs.', {
          note: 'Short-answer favourite in value-based questions. Mention consent and that one donor can help several people.',
        }),
        A('Consent for donation', 'l', 'Organs can be donated after the death of the donor, with the consent of the family.'),
      ]),
      S('Transplants', [
        A('Kidney transplant', 'a', 'A kidney transplant replaces a non-functioning kidney with one from a donor, often a close relative.'),
      ]),
    ]),
  ],
  relations: [
    ['Living organism', 'requires', 'Molecular movement', 'A living organism must keep its molecules moving to stay alive.'],
    ['Viruses', 'contrasts_with', 'Living organism', 'Viruses show no molecular movement outside a cell, unlike living organisms.'],
    ['Life processes', 'requires', 'Energy for maintenance', 'The life processes that maintain the body need energy from outside it.'],
    ['Maintenance', 'requires', 'Food', 'Repair and maintenance of the body need the materials that food supplies.'],
    ['Growth', 'requires', 'Food', 'An organism needs raw material from food in order to grow.'],
    ['Nutrition', 'requires', 'Food', 'Nutrition transfers the energy source in food from outside the body to inside.'],
    ['Oxidation of food', 'causes', 'Energy for maintenance', 'Oxidising food molecules inside cells releases the energy needed for maintenance.'],
    ['Carbon-based molecules', 'part_of', 'Food', 'Most food sources are carbon-based molecules.'],
    ['Autotrophic nutrition', 'kind_of', 'Nutrition', 'Autotrophic nutrition is one mode of nutrition.'],
    ['Heterotrophic nutrition', 'kind_of', 'Nutrition', 'Heterotrophic nutrition is the other mode of nutrition.'],
    ['Autotrophic nutrition', 'contrasts_with', 'Heterotrophic nutrition', 'Autotrophs make their own food while heterotrophs take in food made by others.'],
    ['Autotroph', 'defined_by', 'Autotrophic nutrition', 'An autotroph is an organism that obtains food by autotrophic nutrition.'],
    ['Photosynthesis', 'kind_of', 'Autotrophic nutrition', 'Photosynthesis is the mode of autotrophic nutrition found in green plants.'],
    ['Starch', 'kind_of', 'Carbohydrates', 'Starch is the form in which plants store carbohydrates they do not use at once.'],
    ['Glycogen', 'contrasts_with', 'Starch', 'Animals store energy as glycogen where plants store it as starch.'],
    ['Photosynthesis', 'causes', 'Carbohydrates', 'Photosynthesis produces carbohydrates from carbon dioxide and water.'],
    ['Chlorophyll', 'part_of', 'Chloroplast', 'Chlorophyll is held in the chloroplasts of leaf cells.'],
    ['Chloroplast', 'part_of', 'Mesophyll cells', 'The mesophyll cells of the leaf are packed with chloroplasts.'],
    ['Photosynthesis', 'requires', 'Chlorophyll', 'Photosynthesis requires chlorophyll to absorb light energy.'],
    ['Light absorption', 'requires', 'Chlorophyll', 'Light energy is absorbed by chlorophyll.'],
    ['Light absorption', 'part_of', 'Photosynthesis', 'Absorbing light energy is the first event of photosynthesis.'],
    ['Splitting of water', 'follows', 'Light absorption', 'After light is absorbed, its energy splits water molecules.'],
    ['Reduction of carbon dioxide', 'follows', 'Splitting of water', 'Carbon dioxide is reduced to carbohydrate after water has been split.'],
    ['Reduction of carbon dioxide', 'part_of', 'Photosynthesis', 'Reducing carbon dioxide to carbohydrate is the last event of photosynthesis.'],
    ['Photosynthesis', 'defined_by', 'Photosynthesis equation', 'The overall process of photosynthesis is summarised by its balanced equation.'],
    ['Desert plants', 'requires', 'Stomata', 'Desert plants open their stomata at night to take in carbon dioxide.'],
    ['Iodine test', 'requires', 'Starch', 'A blue-black colour in the iodine test needs starch to be present.'],
    ['Iodine test', 'follows', 'Destarching', 'The leaf is tested with iodine only after the plant has been destarched.'],
    ['Variegated leaf', 'causes', 'Chlorophyll is necessary', 'Testing a variegated leaf shows that starch forms only where there is chlorophyll.'],
    ['Chlorophyll is necessary', 'follows', 'Iodine test', 'The conclusion is drawn once the iodine test shows where starch formed.'],
    ['Guard cells', 'part_of', 'Stomata', 'Each stomatal pore is bordered by a pair of guard cells.'],
    ['Guard cells', 'causes', 'Stomatal closing', 'Guard cells that lose water shrink and close the pore.'],
    ['Gaseous exchange in leaves', 'requires', 'Stomata', 'Gaseous exchange in leaves takes place through the stomata.'],
    ['Photosynthesis', 'requires', 'Gaseous exchange in leaves', 'Photosynthesis needs the carbon dioxide taken in through gaseous exchange.'],
    ['Heterotroph', 'defined_by', 'Heterotrophic nutrition', 'A heterotroph is an organism that obtains food by heterotrophic nutrition.'],
    ['Heterotroph', 'requires', 'Autotroph', 'Heterotrophs depend directly or indirectly on autotrophs for food.'],
    ['Saprophytic nutrition', 'kind_of', 'Heterotrophic nutrition', 'Saprophytic nutrition is a kind of heterotrophic nutrition.'],
    ['Parasitic nutrition', 'kind_of', 'Heterotrophic nutrition', 'Parasitic nutrition is a kind of heterotrophic nutrition.'],
    ['Holozoic nutrition', 'kind_of', 'Heterotrophic nutrition', 'Holozoic nutrition is a kind of heterotrophic nutrition.'],
    ['Saprophytic nutrition', 'contrasts_with', 'Holozoic nutrition', 'Saprophytes digest food outside the body, while holozoic organisms digest it inside.'],
    ['Saprophytic nutrition', 'requires', 'Breakdown outside the body', 'Saprophytes rely on breaking food down outside the body.'],
    ['Holozoic nutrition', 'requires', 'Ingestion of whole material', 'Holozoic organisms take in whole food before digesting it.'],
    ['Breakdown outside the body', 'contrasts_with', 'Ingestion of whole material', 'Some organisms break food down outside the body; others take it in whole.'],
    ['Cuscuta', 'kind_of', 'Parasitic nutrition', 'Cuscuta is an example of a plant with parasitic nutrition.'],
    ['Ticks and lice', 'kind_of', 'Parasitic nutrition', 'Ticks and lice are examples of animals with parasitic nutrition.'],
    ['Fungi', 'kind_of', 'Saprophytic nutrition', 'Fungi are examples of organisms with saprophytic nutrition.'],
    ['Amoeba', 'kind_of', 'Holozoic nutrition', 'Amoeba takes in whole food particles, which is holozoic nutrition.'],
    ['Amoeba', 'causes', 'Food vacuole', 'The extensions of Amoeba fuse around a food particle and form a food vacuole.'],
    ['Paramoecium', 'contrasts_with', 'Amoeba', 'Paramoecium takes in food at a fixed spot, unlike Amoeba.'],
    ['Teeth', 'part_of', 'Mouth', 'The teeth in the mouth chew and grind the food.'],
    ['Salivary amylase', 'part_of', 'Saliva', 'Saliva contains the enzyme salivary amylase.'],
    ['Mouth', 'part_of', 'Alimentary canal', 'The mouth is the first part of the alimentary canal.'],
    ['Oesophagus', 'part_of', 'Alimentary canal', 'The oesophagus is part of the alimentary canal.'],
    ['Stomach', 'part_of', 'Alimentary canal', 'The stomach is part of the alimentary canal.'],
    ['Small intestine', 'part_of', 'Alimentary canal', 'The small intestine is the longest part of the alimentary canal.'],
    ['Large intestine', 'part_of', 'Alimentary canal', 'The large intestine is part of the alimentary canal.'],
    ['Salivary amylase', 'kind_of', 'Enzyme', 'Salivary amylase is an enzyme.'],
    ['Pepsin', 'kind_of', 'Enzyme', 'Pepsin is an enzyme.'],
    ['Trypsin', 'kind_of', 'Enzyme', 'Trypsin is an enzyme.'],
    ['Lipase', 'kind_of', 'Enzyme', 'Lipase is an enzyme.'],
    ['Lipase', 'requires', 'Bile', 'Lipase acts on fats after bile has broken them into small globules.'],
    ['Pepsin', 'requires', 'Hydrochloric acid', 'Pepsin acts in the acidic medium created by hydrochloric acid.'],
    ['Gastric glands', 'part_of', 'Stomach', 'Gastric glands are present in the wall of the stomach.'],
    ['Pepsin', 'part_of', 'Gastric glands', 'Pepsin is secreted by the gastric glands.'],
    ['Mucus', 'contrasts_with', 'Hydrochloric acid', 'Mucus protects the stomach lining from the acid.'],
    ['Oesophagus', 'requires', 'Peristalsis', 'Peristalsis moves food down the oesophagus.'],
    ['Sphincter muscle', 'part_of', 'Stomach', 'A sphincter muscle controls the exit from the stomach.'],
    ['Intestinal juice', 'part_of', 'Small intestine', 'Intestinal juice is secreted by glands in the small intestine.'],
    ['Trypsin', 'follows', 'Pepsin', 'Protein digestion begun by pepsin in the stomach is continued by trypsin in the small intestine.'],
    ['Villi', 'part_of', 'Small intestine', 'Villi line the inside of the small intestine.'],
    ['Absorption', 'requires', 'Villi', 'Villi provide the large surface area that absorption needs.'],
    ['Absorption', 'follows', 'Intestinal juice', 'Food is absorbed once intestinal juice has completed its digestion.'],
    ['Length and diet', 'defined_by', 'Small intestine', 'The length of the small intestine varies with the animal’s diet.'],
    ['Egestion', 'follows', 'Large intestine', 'Waste leaves through the anus after water is absorbed in the large intestine.'],
    ['Respiration', 'causes', 'ATP', 'Energy released during respiration is used to make ATP.'],
    ['Respiration', 'requires', 'Food', 'Respiration breaks down food to release energy.'],
    ['Aerobic respiration', 'kind_of', 'Respiration', 'Aerobic respiration is one pathway of respiration.'],
    ['Anaerobic respiration', 'kind_of', 'Respiration', 'Anaerobic respiration is another pathway of respiration.'],
    ['Aerobic respiration', 'contrasts_with', 'Anaerobic respiration', 'Aerobic respiration uses oxygen, while anaerobic respiration takes place without it.'],
    ['Aerobic respiration', 'requires', 'Mitochondria', 'Aerobic respiration takes place in the mitochondria, where pyruvate is broken down using oxygen.'],
    ['Glycolysis', 'part_of', 'Respiration', 'Glycolysis is the first step of respiration.'],
    ['Glycolysis', 'causes', 'Pyruvate', 'Glycolysis breaks glucose down into pyruvate.'],
    ['Aerobic respiration', 'follows', 'Glycolysis', 'In mitochondria, pyruvate from glycolysis is broken down using oxygen.'],
    ['Fermentation', 'kind_of', 'Anaerobic respiration', 'Fermentation by yeast is anaerobic respiration.'],
    ['Lactic acid', 'causes', 'Muscle cramps', 'A build-up of lactic acid causes muscle cramps.'],
    ['Lactic acid', 'requires', 'Pyruvate', 'Lactic acid is made from pyruvate when oxygen runs short.'],
    ['ATP', 'requires', 'ADP', 'ATP is formed from ADP and inorganic phosphate.'],
    ['Uses of ATP', 'requires', 'ATP', 'Cell activities draw their energy from ATP.'],
    ['Exhaled air', 'causes', 'Lime water test', 'Exhaled air turns lime water milky because of its carbon dioxide.'],
    ['Yeast fermentation experiment', 'requires', 'Fermentation', 'The experiment works because yeast ferments the sugar.'],
    ['Yeast fermentation experiment', 'requires', 'Lime water test', 'The carbon dioxide released by yeast is detected with lime water.'],
    ['Gills', 'contrasts_with', 'Lungs', 'Aquatic animals use gills while terrestrial animals use lungs.'],
    ['Rate of breathing in water', 'requires', 'Gills', 'Low dissolved oxygen makes aquatic animals move water past their gills faster.'],
    ['Alveoli', 'part_of', 'Lungs', 'The alveoli are at the ends of the smallest tubes in the lungs.'],
    ['Trachea', 'follows', 'Nostrils', 'Air passes from the nostrils through the throat into the trachea.'],
    ['Lungs', 'follows', 'Trachea', 'From the trachea, air passes into the lungs.'],
    ['Cilia', 'part_of', 'Trachea', 'Cilia line the air passage.'],
    ['Diaphragm', 'causes', 'Lungs', 'Flattening the diaphragm enlarges the chest cavity so air is sucked into the lungs.'],
    ['Residual volume', 'part_of', 'Lungs', 'The lungs always hold a residual volume of air.'],
    ['Haemoglobin', 'part_of', 'Red blood corpuscles', 'Haemoglobin is present in the red blood corpuscles.'],
    ['Haemoglobin', 'follows', 'Alveoli', 'Oxygen taken into the alveoli is carried away by haemoglobin in the blood.'],
    ['Carbon dioxide transport', 'contrasts_with', 'Haemoglobin', 'Oxygen is carried by haemoglobin, but carbon dioxide travels mostly dissolved in plasma.'],
    ['Diffusion in plants', 'requires', 'Stomata', 'Leaves exchange gases by diffusion through the stomata.'],
    ['Night-time respiration', 'contrasts_with', 'Daytime exchange', 'At night plants release carbon dioxide; in the day oxygen release dominates.'],
    ['Daytime exchange', 'requires', 'Photosynthesis', 'In the day, carbon dioxide from respiration is used up by photosynthesis.'],
    ['Smoking', 'causes', 'Lung cancer', 'Smoking is a major cause of lung cancer.'],
    ['Smoking', 'contrasts_with', 'Cilia', 'Smoking destroys the cilia that keep the air passage clean.'],
    ['Diffusion limits', 'causes', 'Transport system', 'Because diffusion is too slow, larger organisms need a transport system.'],
    ['Circulatory system', 'kind_of', 'Transport system', 'The circulatory system is the transport system of human beings.'],
    ['Heart', 'part_of', 'Circulatory system', 'The heart is part of the circulatory system.'],
    ['Blood', 'part_of', 'Circulatory system', 'Blood is part of the circulatory system.'],
    ['Heart', 'kind_of', 'Pumping organ', 'The heart is the pumping organ of the body.'],
    ['Plasma', 'part_of', 'Blood', 'Plasma is the fluid part of blood.'],
    ['Blood cells', 'part_of', 'Blood', 'Blood cells are suspended in plasma.'],
    ['Platelets', 'part_of', 'Blood', 'Platelets circulate in the blood.'],
    ['Red blood corpuscles', 'part_of', 'Blood', 'Red blood corpuscles are cells of the blood.'],
    ['Transport of hormones', 'requires', 'Plasma', 'Hormones travel dissolved in plasma.'],
    ['Nitrogenous wastes in blood', 'requires', 'Plasma', 'Nitrogenous wastes travel dissolved in plasma.'],
    ['Double circulation', 'requires', 'Four-chambered heart', 'Double circulation needs a four-chambered heart that keeps the two circuits apart.'],
    ['Pulmonary circulation', 'part_of', 'Double circulation', 'Pulmonary circulation is one of the two circuits.'],
    ['Systemic circulation', 'part_of', 'Double circulation', 'Systemic circulation is the other circuit.'],
    ['Systemic circulation', 'follows', 'Pulmonary circulation', 'Blood oxygenated in the lungs returns to the heart and is then pumped to the body.'],
    ['Atrium', 'part_of', 'Heart', 'The atria are chambers of the heart.'],
    ['Ventricle', 'part_of', 'Heart', 'The ventricles are chambers of the heart.'],
    ['Valves', 'part_of', 'Heart', 'Valves are present in the heart.'],
    ['Ventricle', 'follows', 'Atrium', 'Blood passes from each atrium into the ventricle below it.'],
    ['Four-chambered heart', 'contrasts_with', 'Three-chambered heart', 'A four-chambered heart keeps blood streams apart; a three-chambered heart lets them mix.'],
    ['Pulmonary vein', 'part_of', 'Pulmonary circulation', 'The pulmonary vein returns oxygenated blood from the lungs.'],
    ['Aorta', 'part_of', 'Systemic circulation', 'The aorta carries blood out into the systemic circuit.'],
    ['Vena cava', 'part_of', 'Systemic circulation', 'The vena cava returns blood from the systemic circuit.'],
    ['Aorta', 'follows', 'Ventricle', 'The left ventricle pumps blood into the aorta.'],
    ['Warm-blooded animals', 'requires', 'Four-chambered heart', 'Birds and mammals need the efficient supply a four-chambered heart gives.'],
    ['Cold-blooded animals', 'contrasts_with', 'Warm-blooded animals', 'Cold-blooded animals can tolerate mixing of blood; warm-blooded animals cannot.'],
    ['Cold-blooded animals', 'requires', 'Three-chambered heart', 'Amphibians and many reptiles manage with a three-chambered heart.'],
    ['Energy need of plants', 'contrasts_with', 'Warm-blooded animals', 'Plants need far less energy than warm-blooded animals.'],
    ['Arteries', 'contrasts_with', 'Veins', 'Arteries carry blood away from the heart; veins bring it back.'],
    ['Capillaries', 'follows', 'Arteries', 'Arteries branch into smaller and smaller vessels that end in capillaries.'],
    ['Veins', 'follows', 'Capillaries', 'Capillaries join up to form veins that return blood to the heart.'],
    ['Systolic pressure', 'kind_of', 'Blood pressure', 'Systolic pressure is the blood pressure inside an artery during ventricular contraction.'],
    ['Hypertension', 'kind_of', 'Blood pressure', 'Hypertension is blood pressure that is too high.'],
    ['Sphygmomanometer', 'defined_by', 'Blood pressure', 'A sphygmomanometer is the instrument that measures blood pressure.'],
    ['Clotting', 'requires', 'Platelets', 'Blood clots with the help of platelets.'],
    ['Lymph', 'contrasts_with', 'Plasma', 'Lymph is like the plasma of blood but colourless and with less protein.'],
    ['Lymph', 'follows', 'Capillaries', 'Lymph is the fluid that escapes from capillaries into the spaces between cells.'],
    ['Lymph', 'requires', 'Lymphatic vessels', 'Lymph drains back through lymphatic vessels.'],
    ['Fat absorption by lymph', 'requires', 'Lymph', 'Absorbed fat is carried by lymph.'],
    ['Fat absorption by lymph', 'follows', 'Absorption', 'Fat absorbed in the intestine is then carried away by lymph.'],
    ['Xylem', 'part_of', 'Vascular tissue', 'Xylem is part of the vascular tissue.'],
    ['Phloem', 'part_of', 'Vascular tissue', 'Phloem is part of the vascular tissue.'],
    ['Xylem', 'contrasts_with', 'Phloem', 'Xylem carries water and minerals while phloem carries food.'],
    ['Root pressure', 'causes', 'Water column', 'Root pressure pushes water into the xylem column.'],
    ['Water column', 'requires', 'Xylem', 'The column of water runs through the interconnected xylem.'],
    ['Transpiration pull', 'causes', 'Water column', 'Transpiration pull draws the column of water upward.'],
    ['Transpiration', 'causes', 'Transpiration pull', 'Transpiration from the leaves creates the pull.'],
    ['Transpiration', 'requires', 'Stomata', 'Water vapour is lost mostly through the stomata.'],
    ['Transpiration', 'causes', 'Temperature regulation', 'Transpiration helps to regulate the plant’s temperature.'],
    ['Night-time water movement', 'requires', 'Root pressure', 'At night, water moves up mainly by root pressure.'],
    ['Night-time water movement', 'contrasts_with', 'Transpiration pull', 'Root pressure dominates at night, transpiration pull in the day.'],
    ['Translocation', 'requires', 'Phloem', 'Translocation takes place in the phloem.'],
    ['Sieve tubes', 'part_of', 'Phloem', 'Sieve tubes are part of the phloem.'],
    ['Sucrose transport', 'part_of', 'Translocation', 'Moving sucrose into phloem is part of translocation.'],
    ['Sucrose transport', 'requires', 'ATP', 'Loading sucrose into phloem uses energy from ATP.'],
    ['Translocation', 'contrasts_with', 'Transpiration pull', 'Translocation needs energy, while water rises by transpiration pull without it.'],
    ['Excretion', 'requires', 'Nitrogenous wastes', 'Excretion removes nitrogenous wastes from the body.'],
    ['Unicellular excretion', 'kind_of', 'Excretion', 'Diffusion from the body surface is how single cells excrete.'],
    ['Nephron', 'part_of', 'Kidney', 'Each nephron is a filtration unit of the kidney.'],
    ['Glomerulus', 'part_of', 'Nephron', 'The glomerulus is the filtering part of a nephron.'],
    ["Bowman's capsule", 'part_of', 'Nephron', 'Bowman’s capsule is the cup-shaped start of a nephron.'],
    ['Glomerulus', 'part_of', "Bowman's capsule", 'The glomerulus sits inside Bowman’s capsule.'],
    ['Selective reabsorption', 'follows', 'Glomerulus', 'After filtration in the glomerulus, useful substances are reabsorbed along the tube.'],
    ['Regulation of urine', 'requires', 'Selective reabsorption', 'The amount of urine depends on how much water is reabsorbed.'],
    ['Ureter', 'follows', 'Kidney', 'Urine leaves each kidney through its ureter.'],
    ['Urinary bladder', 'follows', 'Ureter', 'Ureters carry urine into the urinary bladder.'],
    ['Kidney', 'requires', 'Nitrogenous wastes in blood', 'The kidneys filter nitrogenous wastes out of the blood.'],
    ['Dialysis', 'contrasts_with', 'Nephron', 'An artificial kidney does by dialysis what the nephrons do by filtration.'],
    ['Oxygen as waste', 'follows', 'Photosynthesis', 'Oxygen is released as a by-product of photosynthesis.'],
    ['Excess water loss', 'requires', 'Transpiration', 'Plants lose excess water by transpiration.'],
    ['Leaf fall', 'kind_of', 'Excretion', 'Shedding leaves is one way plants get rid of wastes.'],
    ['Resins and gums', 'part_of', 'Xylem', 'Resins and gums are stored in old xylem.'],
    ['Organ donation', 'requires', 'Consent for donation', 'Organ donation requires the consent of the donor’s family.'],
    ['Kidney transplant', 'kind_of', 'Organ donation', 'A kidney transplant is a common form of organ donation.'],
    ['Kidney transplant', 'contrasts_with', 'Dialysis', 'A transplant is a lasting alternative to repeated dialysis.'],
  ],
};
