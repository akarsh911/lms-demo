import { A, S, T, type ChapterSeed } from './mindmap-seed';

export const CONTROL_AND_COORDINATION: ChapterSeed = {
  folded: 'Reflex arc',
  topics: [
    T('Need for control and coordination', 111, [
      S('Responding to the environment', [
        A('Coordination', 'd', 'Coordination is the working together of the various organs of the body in a systematic, controlled and efficient way.', {
          pyq: [[2020, 1, 'What is meant by coordination in living organisms?']],
        }),
        A('Stimulus', 'd', 'A change in the environment to which an organism responds is called a stimulus.'),
        A('Response', 'd', 'A response is the reaction of an organism to a stimulus.'),
      ]),
    ]),
    T('Nervous system', 112, [
      S('Nerve cells', [
        A('Nervous tissue', 'd', 'Control and coordination in animals is provided by nervous tissue, made of an organised network of nerve cells or neurons.'),
        A('Neuron', 'd', 'A neuron is the cell that carries an electrical impulse from one part of the body to another.', {
          pyq: [
            [2023, 3, 'Draw a neat diagram of a neuron and label the dendrite, cell body and axon.'],
            [2020, 1, 'What is the structural and functional unit of the nervous system?'],
          ],
          note: 'Three labels, three marks. Arrows on the diagram must point from dendrite to axon.',
        }),
      ]),
      S('Between neurons', [
        A('Synapse', 'd', 'The gap between two neurons across which the impulse passes is called a synapse.', {
          pyq: [[2022, 2, 'What is a synapse? How does an impulse cross it?']],
        }),
        A('Reflex arc', 'd', 'A reflex arc is the pathway an impulse takes from a receptor to the muscle that responds.', {
          pyq: [[2024, 3, 'Draw a labelled flow chart of a reflex arc and explain why reflex arcs have evolved.']],
          ex: 'Why are reflex arcs formed in the spinal cord and not in the brain?',
        }),
      ]),
    ]),
    T('Structure of a neuron', 112, [
      S('Parts of a neuron', [
        A('Dendrite', 'd', 'Information is acquired at the end of the dendritic tip of a nerve cell.'),
        A('Cell body', 'd', 'The impulse travels from the dendrite to the cell body, which contains the nucleus.'),
        A('Axon', 'd', 'The impulse travels from the cell body along the axon to its end.'),
        A('Nerve ending', 'd', 'At the end of the axon, the electrical impulse sets off the release of some chemicals.'),
      ]),
    ]),
    T('Transmission of impulses', 113, [
      S('Electrical and chemical signals', [
        A('Electrical impulse', 'd', 'Information travels inside a neuron as an electrical impulse.'),
        A('Neurotransmitter', 'd', 'Chemicals released at the end of an axon cross the gap and start a similar electrical impulse in a dendrite of the next neuron.', {
          ex: 'What would happen at a synapse if the axon ending stopped releasing chemicals?',
        }),
      ]),
      S('Direction and detection', [
        A('One-way transmission', 'l', 'At a synapse the impulse can travel in only one direction, from the axon of one neuron to the dendrite of the next.'),
        A('Receptors', 'd', 'Receptors are specialised tips of some nerve cells that detect information from the environment.', {
          pyq: [[2019, 2, 'What are receptors? Name any two receptors and their location.']],
        }),
      ]),
    ]),
    T('Receptors and sense organs', 112, [
      S('Light and sound', [
        A('Photoreceptors', 'd', 'Photoreceptors in the eye detect light.'),
        A('Phonoreceptors', 'd', 'Phonoreceptors in the inner ear detect sound.'),
      ]),
      S('Smell and taste', [
        A('Olfactory receptors', 'd', 'Olfactory receptors in the nose detect smell.'),
        A('Gustatory receptors', 'd', 'Gustatory receptors on the tongue detect taste.'),
      ]),
    ]),
    T('Reflex action', 113, [
      S('Acting without thinking', [
        A('Reflex action', 'd', 'A reflex action is a sudden, involuntary response to a stimulus.', {
          pyq: [[2021, 2, 'What is a reflex action? Give one example.']],
          note: 'Always give the hot-plate example; it is the one the marking scheme expects.',
        }),
        A('Withdrawal reflex', 'a', 'Pulling a hand away from a flame is a reflex action completed before we think about it.'),
      ]),
      S('Where it is processed', [
        A('Spinal cord', 'd', 'Nerves from all over the body meet in a bundle in the spinal cord, where reflex arcs are formed.'),
        A('Effector', 'd', 'An effector is the muscle or gland that carries out the response.'),
      ]),
    ]),
    T('Human brain', 115, [
      S('The coordinating centre', [
        A('Brain', 'd', 'The brain is the main coordinating centre of the body.'),
        A('Forebrain', 'd', 'The forebrain is the main thinking part of the brain.', {
          pyq: [[2023, 1, 'Which part of the brain is the main thinking part?']],
        }),
        A('Cerebrum', 'd', 'The cerebrum has separate areas that receive sensory impulses and areas that control voluntary muscles.'),
      ]),
      S('Lower parts', [
        A('Midbrain', 'd', 'Involuntary actions such as the change in the size of the pupil are controlled by the midbrain.'),
        A('Hindbrain', 'd', 'The hindbrain consists of the pons, the medulla and the cerebellum.'),
      ]),
    ]),
    T('Parts of the hindbrain', 116, [
      S('Involuntary control', [
        A('Medulla', 'd', 'The medulla in the hindbrain controls involuntary actions such as blood pressure, salivation and vomiting.', {
          pyq: [[2022, 1, 'Name the part of the brain that controls salivation and vomiting.']],
        }),
        A('Pons', 'd', 'The pons takes part in regulating respiration.'),
      ]),
      S('Balance', [
        A('Cerebellum', 'd', 'The cerebellum is responsible for precision of voluntary actions and for maintaining the posture and balance of the body.', {
          pyq: [[2024, 1, 'Which part of the brain maintains posture and balance of the body?']],
        }),
      ]),
    ]),
    T('Protection of the brain and spinal cord', 117, [
      S('Protective structures', [
        A('Cranium', 'd', 'The brain sits inside a bony box called the cranium.'),
        A('Cerebrospinal fluid', 'd', 'The brain is contained in a fluid-filled balloon which provides further shock absorption.'),
        A('Vertebral column', 'd', 'The spinal cord is protected by the vertebral column, or backbone.'),
      ]),
    ]),
    T('Central and peripheral nervous system', 115, [
      S('The two divisions', [
        A('Central nervous system', 'd', 'The brain and spinal cord constitute the central nervous system.'),
        A('Peripheral nervous system', 'd', 'Cranial nerves arising from the brain and spinal nerves arising from the spinal cord form the peripheral nervous system.'),
      ]),
      S('Thinking before acting', [
        A('Voluntary action', 'x', 'A voluntary action, such as writing or talking, is based on deciding what to do next.'),
      ]),
    ]),
    T('How nervous tissue causes action', 117, [
      S('Muscles respond', [
        A('Muscle contraction', 'p', 'When a nerve impulse reaches a muscle, the muscle fibres change their shape and the muscle contracts.'),
        A('Muscle proteins', 'd', 'Muscle cells have special proteins that change both their shape and their arrangement in response to nervous electrical impulses.'),
      ]),
      S('Limits of nerves', [
        A('Limits of nerve signals', 'e', 'Nerve impulses reach only those cells connected by nervous tissue, and a cell needs time to reset before it can send a new impulse.'),
      ]),
    ]),
    T('Coordination in plants', 118, [
      S('Movement without growth', [
        A('Plant movement', 'd', 'Plants respond to stimuli by movement, which may or may not be connected with growth.'),
        A('Touch-me-not plant', 'a', 'The leaves of the sensitive plant fold up and droop when touched, without any growth.', {
          pyq: [[2021, 2, 'How do the leaves of the sensitive plant move in response to touch?']],
        }),
        A('Change in cell shape', 'p', 'Plant cells change shape by changing the amount of water in them, resulting in swelling or shrinking.'),
      ]),
    ]),
    T('Tropic movements', 119, [
      S('Directional growth', [
        A('Tropism', 'd', 'A tropism is a directional growth movement of a plant in response to a stimulus.'),
        A('Phototropism', 'd', 'The growth of shoots towards light is called phototropism.', {
          pyq: [[2023, 2, 'What is phototropism? Describe an activity to demonstrate it.']],
        }),
        A('Geotropism', 'd', 'Roots grow downwards in response to the pull of gravity; this is geotropism.'),
      ]),
      S('Water, chemicals and support', [
        A('Hydrotropism', 'd', 'The growth of roots towards water is called hydrotropism.'),
        A('Chemotropism', 'd', 'The growth of pollen tubes towards ovules is an example of chemotropism.'),
        A('Tendrils', 'a', 'The tendrils of a pea plant coil around a support because the part away from the support grows faster.'),
      ]),
    ]),
    T('Plant hormones', 120, [
      S('Growth promoters', [
        A('Auxin', 'd', 'Auxin is synthesised at the shoot tip and helps the cells to grow longer.', {
          pyq: [[2024, 2, 'Name the plant hormone that helps in cell elongation and explain its role in phototropism.']],
        }),
        A('Gibberellins', 'd', 'Gibberellins help in the growth of the stem.'),
        A('Cytokinins', 'd', 'Cytokinins promote cell division and are present in greater concentration in areas such as fruits and seeds.'),
      ]),
      S('Growth inhibitor', [
        A('Abscisic acid', 'd', 'Abscisic acid inhibits growth, and its effects include the wilting of leaves.'),
      ]),
      S('Bending towards light', [
        A('Auxin and light', 'e', 'When light comes from one side, auxin diffuses towards the shady side, which then grows faster and bends the shoot towards light.', {
          ex: 'A shoot is lit from the left. On which side will auxin collect, and which way will the shoot bend?',
        }),
      ]),
    ]),
    T('Hormones', 122, [
      S('Chemical messengers', [
        A('Hormone', 'd', 'Hormones are chemical messengers secreted by endocrine glands directly into the blood.'),
        A('Endocrine gland', 'd', 'Endocrine glands are ductless glands that release their hormones directly into the blood.'),
      ]),
      S('Two well-known hormones', [
        A('Insulin', 'd', 'Insulin is the hormone that regulates the level of sugar in the blood.', {
          pyq: [
            [2024, 1, 'Name the hormone that regulates blood sugar and the gland that secretes it.'],
            [2021, 2, 'What happens if insulin is not secreted in proper amounts?'],
          ],
        }),
        A('Adrenaline', 'd', 'Adrenaline is secreted into the blood to prepare the body for an emergency.', {
          pyq: [[2022, 3, 'Why is adrenaline called the emergency hormone? List its effects on the body.']],
          note: 'List the effects in body order: heart, blood to muscles, breathing rate, digestion slows.',
        }),
      ]),
    ]),
    T('Endocrine glands in humans', 122, [
      S('Glands of the head and neck', [
        A('Pituitary gland', 'd', 'The pituitary gland secretes hormones including growth hormone, which regulates growth and development.'),
        A('Thyroid gland', 'd', 'The thyroid gland makes thyroxin, which regulates carbohydrate, protein and fat metabolism.'),
      ]),
      S('Glands of the abdomen', [
        A('Pancreas', 'd', 'The pancreas secretes insulin, which helps in regulating blood sugar levels.'),
        A('Adrenal gland', 'd', 'The adrenal glands secrete adrenaline.'),
      ]),
      S('Glands of puberty', [
        A('Testes', 'd', 'Testes secrete testosterone, which brings about changes at puberty in boys.'),
        A('Ovaries', 'd', 'Ovaries secrete oestrogen, which brings about changes at puberty in girls.'),
      ]),
    ]),
    T('Hormone imbalance', 123, [
      S('Iodine and the thyroid', [
        A('Iodised salt', 'a', 'Iodine is necessary for the thyroid gland to make thyroxin, so iodised salt is recommended.', {
          pyq: [[2023, 2, 'Why is the use of iodised salt advisable?']],
        }),
        A('Goitre', 'e', 'A deficiency of iodine can cause goitre, a swollen neck.'),
      ]),
      S('Growth and sugar', [
        A('Dwarfism', 'e', 'A deficiency of growth hormone in childhood leads to dwarfism.'),
        A('Diabetes', 'e', 'If insulin is not secreted in proper amounts, the sugar level in the blood rises, causing diabetes.'),
      ]),
    ]),
    T('Feedback mechanism', 124, [
      S('Keeping levels right', [
        A('Feedback mechanism', 'l', 'The timing and amount of hormone released are regulated by feedback mechanisms.', {
          pyq: [[2020, 3, 'How does the feedback mechanism regulate hormone secretion? Explain with an example.']],
        }),
        A('Blood sugar regulation', 'p', 'When the sugar level in blood rises, the pancreas secretes more insulin; as it falls, insulin secretion is reduced.'),
      ]),
      S('Emergency response', [
        A('Fight or flight', 'a', 'Adrenaline speeds up the heartbeat and diverts blood to the skeletal muscles so that the body can deal with an emergency.'),
      ]),
    ]),
  ],
  relations: [
    ['Response', 'follows', 'Stimulus', 'An organism responds after it detects a stimulus.'],
    ['Coordination', 'requires', 'Nervous tissue', 'Animals coordinate their organs through nervous tissue.'],
    ['Coordination', 'requires', 'Hormone', 'Animals also coordinate their organs through hormones.'],
    ['Neuron', 'part_of', 'Nervous tissue', 'Neurons make up nervous tissue.'],
    ['Synapse', 'part_of', 'Neuron', 'A synapse is the junction at the end of a neuron.'],
    ['Dendrite', 'part_of', 'Neuron', 'Dendrites are part of a neuron.'],
    ['Cell body', 'part_of', 'Neuron', 'The cell body is part of a neuron.'],
    ['Axon', 'part_of', 'Neuron', 'The axon is part of a neuron.'],
    ['Nerve ending', 'part_of', 'Axon', 'The nerve ending is at the tip of the axon.'],
    ['Electrical impulse', 'follows', 'Dendrite', 'An impulse begins when dendrites pick up information.'],
    ['Nerve ending', 'causes', 'Neurotransmitter', 'The impulse at the nerve ending releases chemicals.'],
    ['Neurotransmitter', 'requires', 'Synapse', 'The chemicals cross the synapse to the next neuron.'],
    ['One-way transmission', 'requires', 'Synapse', 'The synapse makes the impulse travel one way only.'],
    ['Receptors', 'causes', 'Electrical impulse', 'Receptors that detect a stimulus start an electrical impulse.'],
    ['Photoreceptors', 'kind_of', 'Receptors', 'Photoreceptors are a kind of receptor.'],
    ['Phonoreceptors', 'kind_of', 'Receptors', 'Phonoreceptors are a kind of receptor.'],
    ['Olfactory receptors', 'kind_of', 'Receptors', 'Olfactory receptors are a kind of receptor.'],
    ['Gustatory receptors', 'kind_of', 'Receptors', 'Gustatory receptors are a kind of receptor.'],
    ['Reflex arc', 'requires', 'Spinal cord', 'Reflex arcs are formed in the spinal cord.'],
    ['Reflex action', 'requires', 'Reflex arc', 'A reflex action travels along a reflex arc.'],
    ['Withdrawal reflex', 'kind_of', 'Reflex action', 'Withdrawing a hand from a flame is a reflex action.'],
    ['Effector', 'part_of', 'Reflex arc', 'The effector is the last link of a reflex arc.'],
    ['Receptors', 'part_of', 'Reflex arc', 'The receptor is the first link of a reflex arc.'],
    ['Reflex action', 'contrasts_with', 'Voluntary action', 'A reflex happens without thinking; a voluntary action is decided.'],
    ['Forebrain', 'part_of', 'Brain', 'The forebrain is part of the brain.'],
    ['Midbrain', 'part_of', 'Brain', 'The midbrain is part of the brain.'],
    ['Hindbrain', 'part_of', 'Brain', 'The hindbrain is part of the brain.'],
    ['Cerebrum', 'part_of', 'Forebrain', 'The cerebrum is the main part of the forebrain.'],
    ['Medulla', 'part_of', 'Hindbrain', 'The medulla is part of the hindbrain.'],
    ['Cerebellum', 'part_of', 'Hindbrain', 'The cerebellum is part of the hindbrain.'],
    ['Pons', 'part_of', 'Hindbrain', 'The pons is part of the hindbrain.'],
    ['Voluntary action', 'requires', 'Cerebrum', 'Voluntary muscles are controlled from the cerebrum.'],
    ['Cerebellum', 'contrasts_with', 'Medulla', 'The cerebellum fine-tunes voluntary movement; the medulla runs involuntary actions.'],
    ['Cerebrospinal fluid', 'part_of', 'Cranium', 'The fluid-filled balloon lies inside the cranium.'],
    ['Spinal cord', 'part_of', 'Central nervous system', 'The spinal cord is part of the central nervous system.'],
    ['Brain', 'part_of', 'Central nervous system', 'The brain is part of the central nervous system.'],
    ['Peripheral nervous system', 'contrasts_with', 'Central nervous system', 'Peripheral nerves link the central nervous system to the rest of the body.'],
    ['Vertebral column', 'contrasts_with', 'Cranium', 'The backbone protects the spinal cord as the cranium protects the brain.'],
    ['Muscle contraction', 'requires', 'Muscle proteins', 'Muscles contract because their proteins change shape.'],
    ['Muscle contraction', 'follows', 'Electrical impulse', 'A muscle contracts when a nerve impulse reaches it.'],
    ['Limits of nerve signals', 'contrasts_with', 'Hormone', 'Hormones reach every cell, unlike nerve signals that reach only connected cells.'],
    ['Touch-me-not plant', 'kind_of', 'Plant movement', 'The folding of touch-me-not leaves is a plant movement.'],
    ['Touch-me-not plant', 'requires', 'Change in cell shape', 'The leaves fold because cells change shape by losing water.'],
    ['Tropism', 'kind_of', 'Plant movement', 'A tropism is a growth-related plant movement.'],
    ['Phototropism', 'kind_of', 'Tropism', 'Phototropism is a tropism.'],
    ['Geotropism', 'kind_of', 'Tropism', 'Geotropism is a tropism.'],
    ['Hydrotropism', 'kind_of', 'Tropism', 'Hydrotropism is a tropism.'],
    ['Chemotropism', 'kind_of', 'Tropism', 'Chemotropism is a tropism.'],
    ['Phototropism', 'contrasts_with', 'Geotropism', 'Shoots grow towards light while roots grow towards gravity.'],
    ['Auxin and light', 'causes', 'Phototropism', 'Auxin collecting on the shady side bends the shoot towards light.'],
    ['Auxin and light', 'requires', 'Auxin', 'Bending towards light depends on auxin.'],
    ['Abscisic acid', 'contrasts_with', 'Auxin', 'Abscisic acid inhibits growth, whereas auxin promotes it.'],
    ['Gibberellins', 'contrasts_with', 'Abscisic acid', 'Gibberellins promote stem growth, while abscisic acid inhibits growth.'],
    ['Tendrils', 'requires', 'Auxin', 'Uneven growth of the tendril is driven by growth hormones.'],
    ['Insulin', 'kind_of', 'Hormone', 'Insulin is a hormone.'],
    ['Adrenaline', 'kind_of', 'Hormone', 'Adrenaline is a hormone.'],
    ['Hormone', 'defined_by', 'Endocrine gland', 'A hormone is secreted by an endocrine gland into the blood.'],
    ['Thyroid gland', 'kind_of', 'Endocrine gland', 'The thyroid is an endocrine gland.'],
    ['Pituitary gland', 'kind_of', 'Endocrine gland', 'The pituitary is an endocrine gland.'],
    ['Pancreas', 'kind_of', 'Endocrine gland', 'The pancreas acts as an endocrine gland.'],
    ['Adrenal gland', 'kind_of', 'Endocrine gland', 'The adrenal is an endocrine gland.'],
    ['Testes', 'kind_of', 'Endocrine gland', 'The testes are endocrine glands.'],
    ['Ovaries', 'kind_of', 'Endocrine gland', 'The ovaries are endocrine glands.'],
    ['Pancreas', 'causes', 'Insulin', 'The pancreas secretes insulin.'],
    ['Adrenal gland', 'causes', 'Adrenaline', 'The adrenal glands secrete adrenaline.'],
    ['Testes', 'contrasts_with', 'Ovaries', 'Testes secrete testosterone; ovaries secrete oestrogen.'],
    ['Thyroid gland', 'requires', 'Iodised salt', 'The thyroid needs iodine to make thyroxin.'],
    ['Goitre', 'defined_by', 'Thyroid gland', 'Goitre is a swelling of the thyroid gland in the neck.'],
    ['Dwarfism', 'follows', 'Pituitary gland', 'Dwarfism follows when the pituitary secretes too little growth hormone.'],
    ['Diabetes', 'follows', 'Insulin', 'Diabetes follows when too little insulin is secreted.'],
    ['Blood sugar regulation', 'requires', 'Insulin', 'Blood sugar is kept in range by insulin.'],
    ['Blood sugar regulation', 'kind_of', 'Feedback mechanism', 'Regulating blood sugar is a feedback mechanism.'],
    ['Fight or flight', 'requires', 'Adrenaline', 'The emergency response is driven by adrenaline.'],
  ],
};
