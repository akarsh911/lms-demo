import { A, S, T, type ChapterSeed } from './mindmap-seed';

export const CHEMICAL_REACTIONS: ChapterSeed = {
  topics: [
    T('Chemical changes in daily life', 1, [
      S('Everyday examples', [
        A('Chemical change', 'd', 'A chemical change produces new substances with new properties.'),
        A('Souring of milk', 'a', 'Milk left at room temperature during summer turns sour because of a chemical change.'),
        A('Rusting of iron', 'a', 'An iron tawa, pan or nail left exposed to humid atmosphere gets a reddish-brown coating of rust.'),
      ]),
    ]),
    T('Signs of a chemical reaction', 2, [
      S('What we observe', [
        A('Change in state', 'e', 'A change in state can show that a chemical reaction has taken place.'),
        A('Change in colour', 'e', 'A change in colour is one of the observations that tell us a chemical reaction has occurred.', {
          pyq: [[2022, 1, 'List any two observations that help us determine that a chemical reaction has taken place.']],
        }),
      ]),
      S('Gas and heat', [
        A('Evolution of gas', 'e', 'The evolution of a gas shows that a chemical reaction has taken place.'),
        A('Change in temperature', 'e', 'A change in temperature often accompanies a chemical reaction.'),
      ]),
    ]),
    T('Burning of magnesium', 1, [
      S('The activity', [
        A('Cleaning the ribbon', 'p', 'A magnesium ribbon is cleaned with sandpaper to remove the protective layer of basic magnesium carbonate from its surface.', {
          pyq: [[2023, 1, 'Why should a magnesium ribbon be cleaned before burning it in air?']],
          note: 'The layer is magnesium oxide or carbonate. Either is accepted if the reason given is that it stops the reaction.',
        }),
        A('Magnesium ribbon', 'a', 'A magnesium ribbon burns with a dazzling white flame.'),
      ]),
      S('The product', [
        A('Magnesium oxide', 'd', 'Burning magnesium in air forms a white powder, magnesium oxide.'),
      ]),
    ]),
    T('Word and skeletal equations', 3, [
      S('Writing reactions', [
        A('Chemical equation', 'd', 'A chemical reaction can be represented in a short form as a chemical equation using symbols and formulae.'),
        A('Word equation', 'd', 'A word equation shows the change of reactants to products through an arrow placed between them.'),
      ]),
      S('Two sides', [
        A('Reactants', 'd', 'The substances that undergo chemical change in the reaction are the reactants.'),
        A('Products', 'd', 'The new substances formed during the reaction are the products.'),
      ]),
    ]),
    T('Balancing equations', 4, [
      S('Why balance', [
        A('Law of conservation of mass', 'l', 'Mass can neither be created nor destroyed in a chemical reaction.', {
          pyq: [[2020, 2, 'Why should a chemical equation be balanced?']],
        }),
        A('Balanced equation', 'd', 'In a balanced equation, the number of atoms of each element is the same on the two sides of the arrow.'),
      ]),
      S('How to balance', [
        A('Skeletal equation', 'd', 'An equation in which the masses are not equal on both sides is called a skeletal equation.'),
        A('Hit-and-trial method', 'p', 'Chemical equations are balanced by hit and trial, making trials with the smallest whole-number coefficients.', {
          ex: 'Balance: Fe + H2O → Fe3O4 + H2',
        }),
      ]),
    ]),
    T('Writing physical states', 6, [
      S('State symbols', [
        A('State symbols', 'd', 'The symbols (s), (l), (g) and (aq) show the physical states of reactants and products.'),
        A('Aqueous solution', 'd', 'The symbol (aq) is used if the reactant or product is present as a solution in water.'),
      ]),
      S('Conditions', [
        A('Reaction conditions', 'd', 'Reaction conditions such as temperature, pressure or a catalyst are written above or below the arrow.'),
      ]),
    ]),
    T('Combination reaction', 7, [
      S('One product', [
        A('Combination reaction', 'd', 'A reaction in which a single product is formed from two or more reactants is a combination reaction.', {
          pyq: [[2024, 2, 'What is a combination reaction? Give one example with a balanced equation.']],
        }),
        A('Quicklime and water', 'a', 'Calcium oxide reacts vigorously with water to produce slaked lime, releasing a large amount of heat.', {
          pyq: [[2023, 3, 'A solution of a substance X is used for whitewashing. Name X, write its formula and the reaction of X with water.']],
        }),
      ]),
      S('Whitewashing', [
        A('Slaked lime', 'd', 'A solution of slaked lime, calcium hydroxide, is used for whitewashing walls.'),
        A('Whitewash shine', 'e', 'Calcium hydroxide reacts slowly with carbon dioxide in air to form a thin layer of calcium carbonate that gives a shiny finish to the walls.', {
          note: 'Write the equation; the shine only earns credit with calcium carbonate named.',
        }),
      ]),
    ]),
    T('Exothermic and endothermic reactions', 8, [
      S('Heat in and out', [
        A('Exothermic reaction', 'd', 'Reactions in which heat is released along with the formation of products are called exothermic chemical reactions.', {
          pyq: [[2022, 2, 'Why is respiration considered an exothermic reaction?']],
        }),
        A('Endothermic reaction', 'd', 'Reactions in which energy is absorbed are known as endothermic reactions.'),
      ]),
      S('Examples', [
        A('Respiration as exothermic', 'a', 'Respiration is an exothermic process in which glucose combines with oxygen in our cells to provide energy.'),
        A('Decomposition of vegetable matter', 'a', 'The decomposition of vegetable matter into compost is an example of an exothermic reaction.'),
      ]),
    ]),
    T('Decomposition reaction', 9, [
      S('One reactant breaks down', [
        A('Decomposition reaction', 'd', 'In a decomposition reaction, a single reactant breaks down to give simpler products.', {
          pyq: [[2024, 3, 'What is a decomposition reaction? Give one example each of thermal, electrolytic and photolytic decomposition.']],
        }),
        A('Thermal decomposition', 'd', 'When a decomposition reaction is carried out by heating, it is called thermal decomposition.'),
      ]),
      S('By heat', [
        A('Ferrous sulphate heating', 'a', 'On heating, green ferrous sulphate crystals lose water and decompose into ferric oxide, sulphur dioxide and sulphur trioxide.'),
        A('Calcium carbonate heating', 'a', 'Calcium carbonate decomposes into calcium oxide and carbon dioxide on heating.'),
      ]),
      S('By electricity and light', [
        A('Electrolysis of water', 'a', 'Passing an electric current through water decomposes it into hydrogen and oxygen, with twice as much hydrogen collected.', {
          pyq: [[2021, 2, 'In the electrolysis of water, why is the volume of gas collected over one electrode double that over the other?']],
        }),
        A('Silver chloride in sunlight', 'a', 'White silver chloride turns grey in sunlight as it decomposes into silver and chlorine.'),
      ]),
    ]),
    T('Photochemical reactions', 11, [
      S('Light as energy', [
        A('Light energy in reactions', 'd', 'Some decomposition reactions take place using energy in the form of light.'),
        A('Photography', 'a', 'Silver bromide also decomposes in light, and these reactions are used in black and white photography.'),
      ]),
    ]),
    T('Displacement reaction', 11, [
      S('Reactive metals', [
        A('Displacement reaction', 'd', 'In a displacement reaction, a more reactive element displaces a less reactive element from its compound.', {
          pyq: [[2023, 2, 'What happens when an iron nail is dipped in copper sulphate solution? Write the equation.']],
        }),
        A('Reactivity', 'd', 'A more reactive metal can displace a less reactive metal from a solution of its salt.'),
      ]),
      S('The iron nail activity', [
        A('Iron nail in copper sulphate', 'a', 'An iron nail dipped in copper sulphate solution becomes brownish as copper is deposited, and the blue colour of the solution fades.'),
      ]),
    ]),
    T('Double displacement reaction', 12, [
      S('Exchanging ions', [
        A('Double displacement reaction', 'd', 'Reactions in which there is an exchange of ions between the reactants are called double displacement reactions.'),
        A('Precipitate', 'd', 'An insoluble substance formed in a reaction is called a precipitate.'),
      ]),
      S('The classic example', [
        A('Barium sulphate', 'a', 'Sodium sulphate and barium chloride react to form a white precipitate of barium sulphate.', {
          pyq: [[2022, 2, 'What do you observe when barium chloride solution is added to sodium sulphate solution? Name the type of reaction.']],
        }),
      ]),
    ]),
    T('Oxidation and reduction', 13, [
      S('Gaining and losing', [
        A('Oxidation', 'd', 'If a substance gains oxygen or loses hydrogen during a reaction, it is said to be oxidised.', {
          pyq: [[2024, 1, 'Define oxidation in terms of oxygen.']],
        }),
        A('Reduction', 'd', 'If a substance loses oxygen or gains hydrogen during a reaction, it is said to be reduced.'),
      ]),
      S('Both at once', [
        A('Redox reaction', 'd', 'Reactions in which one reactant gets oxidised while the other gets reduced are called redox reactions.'),
        A('Copper oxide and hydrogen', 'a', 'When hydrogen is passed over heated copper oxide, the copper oxide is reduced to copper and hydrogen is oxidised to water.', {
          ex: 'Identify the substance oxidised and the substance reduced: CuO + H2 → Cu + H2O',
        }),
      ]),
    ]),
    T('Corrosion', 14, [
      S('Metals attacked', [
        A('Corrosion', 'd', 'When a metal is attacked by substances around it such as moisture and acids, it is said to corrode.', {
          pyq: [[2021, 2, 'What is corrosion? Name the colour of the coating formed on silver and copper.']],
        }),
      ]),
      S('Coloured coatings', [
        A('Silver tarnish', 'a', 'Silver articles become black after some time when exposed to air.'),
        A('Copper green coating', 'a', 'Copper acquires a green coating when it reacts with moist carbon dioxide in the air.'),
      ]),
    ]),
    T('Rancidity', 14, [
      S('Spoiled fats', [
        A('Rancidity', 'd', 'When fats and oils are oxidised they become rancid, and their smell and taste change.', {
          pyq: [[2023, 2, 'What is rancidity? Write two ways to prevent it.']],
          note: 'Two methods for two marks: antioxidants, and flushing packets with nitrogen. Refrigeration is accepted as a third.',
        }),
      ]),
      S('Prevention', [
        A('Antioxidants', 'a', 'Antioxidants are added to foods containing fats and oil to prevent oxidation.'),
        A('Nitrogen packing', 'a', 'Bags of chips are flushed with nitrogen gas to prevent the chips from getting oxidised.'),
      ]),
    ]),
    T('Effects of oxidation in daily life', 14, [
      S('Damage and protection', [
        A('Damage to cars and bridges', 'e', 'Corrosion causes damage to car bodies, bridges, iron railings, ships and all objects made of metals.'),
        A('Prevention of rusting', 'a', 'Painting, oiling, greasing and galvanising protect iron from rusting.'),
      ]),
    ]),
  ],
  relations: [
    ['Souring of milk', 'kind_of', 'Chemical change', 'Souring of milk is a chemical change.'],
    ['Rusting of iron', 'kind_of', 'Chemical change', 'Rusting is a chemical change.'],
    ['Rusting of iron', 'kind_of', 'Corrosion', 'Rusting is the corrosion of iron.'],
    ['Chemical change', 'causes', 'Change in colour', 'A chemical change can show itself as a change in colour.'],
    ['Chemical change', 'causes', 'Evolution of gas', 'A chemical change can release a gas.'],
    ['Chemical change', 'causes', 'Change in temperature', 'A chemical change can raise or lower the temperature.'],
    ['Chemical change', 'causes', 'Change in state', 'A chemical change can change the state of the substances.'],
    ['Magnesium ribbon', 'causes', 'Magnesium oxide', 'Burning magnesium forms magnesium oxide.'],
    ['Magnesium ribbon', 'requires', 'Cleaning the ribbon', 'The ribbon burns readily only after it has been cleaned.'],
    ['Magnesium oxide', 'kind_of', 'Products', 'Magnesium oxide is the product of burning magnesium.'],
    ['Word equation', 'kind_of', 'Chemical equation', 'A word equation is a form of chemical equation.'],
    ['Reactants', 'part_of', 'Chemical equation', 'Reactants are written on the left of the equation.'],
    ['Products', 'part_of', 'Chemical equation', 'Products are written on the right of the equation.'],
    ['Products', 'follows', 'Reactants', 'Reactants change into products.'],
    ['Balanced equation', 'requires', 'Law of conservation of mass', 'An equation is balanced because mass is conserved.'],
    ['Skeletal equation', 'contrasts_with', 'Balanced equation', 'A skeletal equation is unbalanced; a balanced one has equal atoms on both sides.'],
    ['Hit-and-trial method', 'causes', 'Balanced equation', 'Hit and trial turns a skeletal equation into a balanced one.'],
    ['Balanced equation', 'follows', 'Skeletal equation', 'An equation is first written in skeletal form and then balanced.'],
    ['State symbols', 'part_of', 'Balanced equation', 'State symbols are added to a balanced equation.'],
    ['Aqueous solution', 'kind_of', 'State symbols', '(aq) is one of the state symbols.'],
    ['Reaction conditions', 'part_of', 'Chemical equation', 'Conditions are written on the arrow of an equation.'],
    ['Quicklime and water', 'kind_of', 'Combination reaction', 'Quicklime and water combine into one product.'],
    ['Quicklime and water', 'causes', 'Slaked lime', 'Quicklime reacts with water to give slaked lime.'],
    ['Slaked lime', 'causes', 'Whitewash shine', 'Slaked lime on walls slowly forms shiny calcium carbonate.'],
    ['Quicklime and water', 'kind_of', 'Exothermic reaction', 'The reaction of quicklime with water releases heat.'],
    ['Exothermic reaction', 'contrasts_with', 'Endothermic reaction', 'Exothermic reactions release heat; endothermic reactions absorb it.'],
    ['Respiration as exothermic', 'kind_of', 'Exothermic reaction', 'Respiration is exothermic.'],
    ['Decomposition of vegetable matter', 'kind_of', 'Exothermic reaction', 'Composting is exothermic.'],
    ['Combination reaction', 'contrasts_with', 'Decomposition reaction', 'A combination joins reactants; a decomposition splits one reactant.'],
    ['Decomposition reaction', 'kind_of', 'Endothermic reaction', 'Decomposition reactions usually need energy, so they are endothermic.'],
    ['Thermal decomposition', 'kind_of', 'Decomposition reaction', 'Thermal decomposition is a decomposition by heat.'],
    ['Ferrous sulphate heating', 'kind_of', 'Thermal decomposition', 'Heating ferrous sulphate is a thermal decomposition.'],
    ['Calcium carbonate heating', 'kind_of', 'Thermal decomposition', 'Heating calcium carbonate is a thermal decomposition.'],
    ['Electrolysis of water', 'kind_of', 'Decomposition reaction', 'Electrolysis of water is a decomposition reaction.'],
    ['Silver chloride in sunlight', 'kind_of', 'Decomposition reaction', 'Silver chloride decomposes in sunlight.'],
    ['Silver chloride in sunlight', 'requires', 'Light energy in reactions', 'Silver chloride decomposes using light energy.'],
    ['Photography', 'requires', 'Light energy in reactions', 'Black and white photography relies on light-driven decomposition.'],
    ['Displacement reaction', 'requires', 'Reactivity', 'Displacement depends on which element is more reactive.'],
    ['Iron nail in copper sulphate', 'kind_of', 'Displacement reaction', 'Iron displacing copper is a displacement reaction.'],
    ['Double displacement reaction', 'contrasts_with', 'Displacement reaction', 'Double displacement exchanges ions both ways; displacement replaces one element.'],
    ['Barium sulphate', 'kind_of', 'Double displacement reaction', 'Forming barium sulphate is a double displacement reaction.'],
    ['Barium sulphate', 'kind_of', 'Precipitate', 'Barium sulphate is the white precipitate formed.'],
    ['Oxidation', 'contrasts_with', 'Reduction', 'Oxidation is gaining oxygen; reduction is losing it.'],
    ['Oxidation', 'part_of', 'Redox reaction', 'Oxidation is one half of a redox reaction.'],
    ['Reduction', 'part_of', 'Redox reaction', 'Reduction is the other half of a redox reaction.'],
    ['Copper oxide and hydrogen', 'kind_of', 'Redox reaction', 'Reducing copper oxide with hydrogen is a redox reaction.'],
    ['Corrosion', 'kind_of', 'Oxidation', 'Corrosion is an oxidation of the metal.'],
    ['Silver tarnish', 'kind_of', 'Corrosion', 'Tarnishing of silver is corrosion.'],
    ['Copper green coating', 'kind_of', 'Corrosion', 'The green coating on copper is corrosion.'],
    ['Oxidation', 'causes', 'Rancidity', 'Oxidation of fats and oils causes rancidity.'],
    ['Antioxidants', 'contrasts_with', 'Rancidity', 'Antioxidants prevent rancidity.'],
    ['Nitrogen packing', 'contrasts_with', 'Rancidity', 'Nitrogen packing prevents rancidity.'],
    ['Corrosion', 'causes', 'Damage to cars and bridges', 'Corrosion damages metal structures.'],
    ['Prevention of rusting', 'contrasts_with', 'Rusting of iron', 'Painting and galvanising prevent rusting.'],
    ['Respiration as exothermic', 'requires', 'Oxidation', 'Respiration oxidises glucose.'],
  ],
};
