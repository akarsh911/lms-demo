import { ASSERTION_OPTIONS, type BankQuestion } from './science-10-bank';

const mcq = (text: string, options: readonly string[], answer: number): BankQuestion => ({ type: 'mcq', text, options, answer });

const ar = (assertion: string, reason: string, answer: number): BankQuestion => ({
  type: 'assertion_reason',
  text: `Assertion (A): ${assertion} Reason (R): ${reason}`,
  options: ASSERTION_OPTIONS,
  answer,
});

const one = (text: string): readonly [string, number] => [text, 1];

const written =
  (type: BankQuestion['type']) =>
  (text: string, ...points: readonly string[]): BankQuestion => ({ type, text, points: points.map(one) });

const vsa = written('very_short');
const sa = written('short');
const la = written('long');
const cb = written('case_based');

export const SOCIAL_SCIENCE_10_BANK: Readonly<Record<string, readonly BankQuestion[]>> = {
  'The Rise of Nationalism in Europe': [
    mcq('Who painted the series of prints showing a "Democratic and Social Republic" of nations in 1848?', ['Frédéric Sorrieu', 'Giuseppe Mazzini', 'Otto von Bismarck', 'Johann Herder'], 0),
    mcq('The Treaty of Vienna (1815) was drawn up mainly to', ['spread democracy', 'undo changes made during the Napoleonic wars', 'unify Germany', 'free Greece'], 1),
    mcq('Young Italy was founded by', ['Cavour', 'Garibaldi', 'Mazzini', 'Victor Emmanuel II'], 2),
    mcq('Germany was unified under the leadership of', ['Austria', 'Prussia', 'Bavaria', 'France'], 1),
    ar('The Civil Code of 1804 is called the Napoleonic Code.', 'It did away with privileges based on birth and established equality before the law.', 1),
    vsa('What was meant by "la patrie" and "le citoyen" in the French Revolution?', 'La patrie: the fatherland, the idea of a united community', 'Le citoyen: the citizen, with equal rights'),
    vsa('Name two symbols used to represent nations as female figures.', 'Marianne for France', 'Germania for Germany'),
    sa('How did the French revolutionaries try to create a sense of collective identity among the French people?', 'Ideas of la patrie and le citoyen were spread', 'A new tricolour flag replaced the royal standard', 'A centralised administration with uniform laws, weights and measures was set up'),
    sa('Describe the role of Otto von Bismarck in the unification of Germany.', 'He was the chief minister of Prussia', 'He fought three wars over seven years with Austria, Denmark and France', 'Prussia won and the German empire was proclaimed in 1871'),
    la('Explain how nationalism developed in Europe after 1815, giving the role of the liberals, the conservatives and the Romantics.', 'Conservatives restored monarchies under the Treaty of Vienna', 'Liberals demanded constitutions, a free press and national unity', 'Secret societies such as Young Italy spread revolutionary ideas', 'Romantics used folk songs, poetry and language to build a national feeling', 'The revolutions of 1830 and 1848 pushed for nation-states'),
    cb('Read: "Giuseppe Mazzini believed that God had intended nations to be the natural units of mankind." (a) Which society did he found in Marseilles? (b) Which country did he want united? (c) Why did Metternich call him dangerous? (d) Name one other society he set up.', 'Young Italy', 'Italy', 'He was seen as a threat to the social order', 'Young Europe in Berne'),
  ],
  'Nationalism in India': [
    mcq('The Non-Cooperation Movement was launched in', ['1919', '1920', '1930', '1942'], 1),
    mcq('The Rowlatt Act (1919) allowed the government to', ['hold elections', 'detain political prisoners without trial', 'grant self-rule', 'abolish salt tax'], 1),
    mcq('Gandhiji\'s Salt March went from Sabarmati to', ['Champaran', 'Dandi', 'Kheda', 'Amritsar'], 1),
    mcq('The Jallianwala Bagh massacre took place in', ['Lahore', 'Amritsar', 'Delhi', 'Calcutta'], 1),
    ar('The Non-Cooperation Movement was withdrawn in 1922.', 'Violence broke out at Chauri Chaura.', 0),
    vsa('What was the idea of satyagraha?', 'It stressed the power of truth', 'and a non-violent struggle against injustice'),
    vsa('Why did the Simon Commission face protests in India?', 'It had no Indian member', 'so Indians saw it as an insult'),
    sa('Why did Gandhiji choose salt as the symbol of the Civil Disobedience Movement?', 'Salt was used by rich and poor alike', 'The tax on salt and the government monopoly were oppressive', 'It could unite all sections of society'),
    sa('How did different social groups take part in the Non-Cooperation Movement?', 'Middle classes boycotted foreign goods, schools and courts', 'Peasants in Awadh protested against landlords', 'Plantation workers in Assam left the plantations'),
    la('Describe the Civil Disobedience Movement: how it began, how it spread and why it was limited.', 'It began with the Salt March to Dandi in 1930', 'People broke salt laws, boycotted foreign cloth and refused taxes', 'Rich peasants and business groups joined', 'Dalits and many Muslims stayed away', 'It was suspended after the Gandhi–Irwin Pact and resumed briefly'),
    cb('Read about the boycott of foreign cloth: its value fell from ₹102 crore in 1921 to ₹57 crore in 1922. (a) Which movement caused this? (b) Why did imports fall? (c) Name one problem in sustaining the boycott. (d) What did people use instead?', 'Non-Cooperation Movement', 'People refused to buy foreign cloth and burnt it', 'Khadi was more expensive than mill cloth', 'Indian cloth and khadi'),
  ],
  'Resources and Development': [
    mcq('Which type of soil is ideal for cotton?', ['alluvial', 'black', 'laterite', 'arid'], 1),
    mcq('Resources that can be renewed or reproduced are', ['non-renewable', 'renewable', 'potential', 'stock'], 1),
    mcq('The Earth Summit of 1992 was held at', ['Rio de Janeiro', 'Kyoto', 'Paris', 'New York'], 0),
    mcq('Ploughing along contour lines to check soil erosion is called', ['terrace farming', 'contour ploughing', 'strip cropping', 'shelter belts'], 1),
    ar('Resource planning is essential in India.', 'Resources are unevenly distributed across the country.', 0),
    vsa('What is meant by sustainable development?', 'Development that does not damage the environment', 'and meets present needs without harming future generations'),
    vsa('Name two states with alluvial soil.', 'Uttar Pradesh', 'Bihar or West Bengal'),
    sa('Explain three stages of resource planning in India.', 'Identifying and making an inventory of resources', 'Evolving a planning structure with technology and skills', 'Matching resource development plans with national plans'),
    sa('What causes land degradation? Name three human activities.', 'Deforestation', 'Overgrazing', 'Mining and quarrying'),
    la('Describe the main types of soil in India and the crops each supports.', 'Alluvial soil in the northern plains supports rice, wheat and sugarcane', 'Black soil in the Deccan supports cotton', 'Red and yellow soil forms on crystalline rock in the south and east', 'Laterite soil in high-rainfall areas suits tea and coffee', 'Arid soil in Rajasthan supports crops with irrigation'),
    cb('A village in a hilly area loses topsoil every monsoon. (a) Name this process. (b) Suggest one method on slopes. (c) Suggest one method in deserts. (d) Why does it matter?', 'Soil erosion', 'Terrace farming or contour ploughing', 'Shelter belts of trees', 'Topsoil is needed for crops and takes centuries to form'),
  ],
  'Power-sharing': [
    mcq('Which country adopted majoritarianism after independence?', ['Belgium', 'Sri Lanka', 'India', 'Switzerland'], 1),
    mcq('In Belgium, the Dutch-speaking community lives mainly in', ['Wallonia', 'Flanders', 'Brussels only', 'the east'], 1),
    mcq('Sharing power among legislature, executive and judiciary is', ['vertical division', 'horizontal division', 'community government', 'coalition'], 1),
    mcq('Power shared among different levels of government is', ['horizontal', 'vertical', 'checks and balances', 'majoritarian'], 1),
    ar('Power-sharing is good for democracy.', 'It reduces conflict between social groups.', 0),
    vsa('What is the "community government" in Belgium?', 'A government elected by one language community', 'with power over cultural, educational and language matters'),
    vsa('Give two reasons why power-sharing is desirable.', 'It reduces conflict between social groups (prudential)', 'It is the spirit of democracy (moral)'),
    sa('How did the Sri Lankan government favour the Sinhala community after 1948?', 'Sinhala was made the only official language', 'Sinhala applicants were favoured for university places and jobs', 'Buddhism was given special protection'),
    sa('Explain three forms of power-sharing in modern democracies.', 'Among organs of government (horizontal)', 'Among governments at different levels (vertical)', 'Among social groups and among parties or pressure groups'),
    la('Compare how Belgium and Sri Lanka dealt with ethnic diversity, and the results.', 'Belgium amended its constitution four times to share power', 'Equal Dutch and French ministers in the central government', 'Community government and special status for Brussels', 'Sri Lanka followed majoritarian policies favouring the Sinhala', 'Belgium stayed united while Sri Lanka faced civil war'),
    cb('Read: "In Belgium, the number of Dutch and French-speaking ministers shall be equal in the central government." (a) Which form of power-sharing is this? (b) Why was it done? (c) Name the city with a separate government. (d) What does this show about democracy?', 'Power-sharing among social groups', 'To avoid tension between the two communities', 'Brussels', 'Accommodation keeps the country united'),
  ],
  Federalism: [
    mcq('Subjects such as defence and foreign affairs are in the', ['State List', 'Union List', 'Concurrent List', 'residuary list'], 1),
    mcq('Education and forests are in the', ['Union List', 'State List', 'Concurrent List', 'no list'], 2),
    mcq('The 1992 amendment made local governments', ['optional', 'more powerful and constitutional', 'abolished', 'appointed'], 1),
    mcq('Which is an example of a "holding together" federation?', ['USA', 'India', 'Switzerland', 'Australia'], 1),
    ar('India is a federal country.', 'Power is divided between the Union and the states by the Constitution.', 0),
    vsa('What is a federation?', 'A system where power is divided', 'between a central authority and its constituent units'),
    vsa('What is the gram sabha?', 'All voters in a village', 'who meet to approve the panchayat\'s budget and work'),
    sa('State three key features of federalism.', 'Two or more levels of government', 'Each level has its own jurisdiction set by the constitution', 'Courts settle disputes between levels'),
    sa('Explain the importance of the linguistic reorganisation of states.', 'States were formed on the basis of language', 'It made administration easier', 'It strengthened national unity'),
    la('Describe the steps taken in 1992 to strengthen local government in India.', 'Regular elections to local bodies made constitutionally mandatory', 'Seats reserved for SC, ST and OBC', 'At least one-third of seats reserved for women', 'State Election Commissions created', 'State governments to share some powers and revenue with local bodies'),
    cb('A state wants a new law on agriculture while the Union passes a different law on an item in the Concurrent List. (a) Which law prevails? (b) Name one Concurrent List subject. (c) Who settles disputes? (d) What is a residuary subject?', 'The Union law', 'Education, forests, trade unions, marriage or adoption', 'The courts, ultimately the Supreme Court', 'A subject in no list, such as computer software, which goes to the Union'),
  ],
  Development: [
    mcq('The main criterion the World Bank uses to compare countries is', ['literacy', 'per capita income', 'life expectancy', 'population'], 1),
    mcq('The Human Development Report is published by', ['World Bank', 'UNDP', 'IMF', 'WTO'], 1),
    mcq('Infant mortality rate means deaths of children under one year per', ['100 live births', '1,000 live births', '10,000 people', '1,000 people'], 1),
    mcq('Kerala has a low infant mortality rate mainly because of', ['high income', 'good health and education facilities', 'large area', 'industries'], 1),
    ar('Average income is not the only measure of development.', 'Income does not show how it is distributed or the quality of life.', 0),
    vsa('What is per capita income?', 'Total income of a country', 'divided by its total population'),
    vsa('Give two examples of non-material things people want.', 'Equal treatment and freedom', 'Security and respect'),
    sa('Why do different people have different developmental goals? Give two examples.', 'People have different situations and needs', 'A landless worker wants more days of work and better wages', 'A rich farmer wants higher prices for crops'),
    sa('What is sustainable development, and why is it important?', 'Development that meets present needs without harming future generations', 'Resources such as groundwater are being overused', 'Present development must not harm future generations'),
    la('Compare Kerala and Punjab on development indicators and explain why per capita income alone is not enough.', 'Punjab has higher per capita income', 'Kerala has a lower infant mortality rate and higher literacy', 'Kerala provides good public health and education', 'Income does not show public facilities', 'So indicators such as the HDI give a fuller picture'),
    cb('Country A has an average income of ₹10,000 for all five citizens; country B averages the same but four earn ₹500 and one earns ₹48,000. (a) Which is more equitable? (b) What does the average hide? (c) Name a better measure. (d) Why does distribution matter?', 'Country A', 'How income is shared among people', 'Median income or the Human Development Index', 'Most people in B are poor despite the same average'),
  ],
};
