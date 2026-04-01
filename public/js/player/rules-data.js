/* Rules Mastery ordeal question definitions — data-driven form rendering.
 * Each section maps to the Rules Mastery ordeal form structure.
 * The 'key' on each question becomes the field name in MongoDB.
 */

export const RULES_SECTIONS = [
  {
    key: 'core_mechanics',
    title: 'Core Mechanics and Dice Pools',
    questions: [
      {
        key: 'q1',
        label: '1. What three components typically make up a mundane dice pool?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q2',
        label: '2. How many successes constitute an exceptional success?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q3',
        label: '3. What benefit does spending Willpower give to a dice roll?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q4',
        label: '4. In a contested roll, what happens when both parties get the same number of successes? What is the difference between contested and resisted?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q5',
        label: '5. True or False: 10-again means you reroll all 10s for the possibility of an additional success.',
        type: 'radio',
        required: true,
        options: [
          { value: 'True', label: 'True' },
          { value: 'False', label: 'False' },
        ],
      },
    ],
  },
  {
    key: 'blood_and_vitae',
    title: 'Blood and Vitae Management',
    questions: [
      {
        key: 'q6',
        label: '6. At what Blood Potency can a vampire no longer feed from humans?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q7',
        label: '7. How much Vitae can you drain from a mortal before they take damage? What other direct consequences are there, and when do they occur?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q8',
        label: '8. How are Ghouls created?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q9',
        label: '9. How are blood bonds created? How long do they last? What is their effect?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q10_vitae_addiction_immune',
        label: '10a. True or False: Kindred with Blood Potency 6+ are immune to Vitae addiction.',
        type: 'radio',
        required: true,
        options: [
          { value: 'True', label: 'True' },
          { value: 'False', label: 'False' },
        ],
      },
      {
        key: 'q10_blood_bond_immune',
        label: '10b. True or False: Kindred with Blood Potency 6+ are immune to the blood bond.',
        type: 'radio',
        required: true,
        options: [
          { value: 'True', label: 'True' },
          { value: 'False', label: 'False' },
        ],
      },
    ],
  },
  {
    key: 'discipline_mechanics',
    title: 'Discipline Mechanics',
    questions: [
      {
        key: 'q11',
        label: '11. What is the typical dice pool for activating a Discipline?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q12',
        label: '12. When two supernatural powers directly oppose each other, what occurs? Briefly explain the mechanic.',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q13',
        label: '13. What must a vampire do to learn an out-of-clan Discipline?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q14',
        label: '14. What do vampires add to rolls resisting supernatural powers?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q15',
        label: '15. Can you use a Discipline power that exceeds your dots in that Discipline?',
        type: 'radio',
        required: true,
        options: [
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
        ],
      },
    ],
  },
  {
    key: 'frenzy_and_the_beast',
    title: 'Frenzy and The Beast',
    questions: [
      {
        key: 'q16',
        label: '16. Name the common triggers for frenzy rolls.',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q17',
        label: '17. Outline the mechanic and function of the bestial triad.',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q18',
        label: '18. What\'s the mechanic for "Riding the Wave" during frenzy? What is the benefit?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q19',
        label: '19. At what Health level do vampires risk fear frenzy?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q20',
        label: '20. True or False: Vampires in frenzy ignore wound penalties.',
        type: 'radio',
        required: true,
        options: [
          { value: 'True', label: 'True' },
          { value: 'False', label: 'False' },
        ],
      },
    ],
  },
  {
    key: 'humanity_and_breaking_points',
    title: 'Humanity and Breaking Points',
    questions: [
      {
        key: 'q21',
        label: '21. What is a breaking point?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q22',
        label: '22. What happens when you fail a detachment roll?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q23',
        label: '23. How do Touchstones help maintain Humanity?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q24',
        label: '24. At Humanity 0, what happens to a vampire?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q25',
        label: '25. Name two banes that affect all vampires.',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    key: 'combat_essentials',
    title: 'Combat Essentials',
    questions: [
      {
        key: 'q26',
        label: '26. What determines Initiative order?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q27',
        label: '27. What makes up a character\'s defence? How does Willpower affect this total? Against how many attackers can you apply your Defence in one turn? Explain the dodge mechanic.',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q28',
        label: '28. What are the three types of damage? What would cause each type of damage to a vampire?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q29',
        label: '29. How much damage does fire typically cause to vampires?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q30',
        label: '30. How are the different types of damage healed?',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    key: 'social_mechanics',
    title: 'Social Mechanics',
    questions: [
      {
        key: 'q31',
        label: '31. What system is used for extended social manipulation?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q32',
        label: '32. How do you gain Beats from Conditions?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q33',
        label: '33. What mechanical benefit does invoking your Mask or Dirge provide?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q34',
        label: '34. What are boons in vampire society?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q35',
        label: '35. True or False: Status provides dice bonuses in social situations.',
        type: 'radio',
        required: true,
        options: [
          { value: 'True', label: 'True' },
          { value: 'False', label: 'False' },
        ],
      },
    ],
  },
  {
    key: 'torpor_and_blood_sympathy',
    title: 'Torpor and Blood Sympathy',
    questions: [
      {
        key: 'q36',
        label: '36. What forces a vampire into torpor?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q37',
        label: '37. List the four levels of Blood Sympathy connection and their effects.',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q38',
        label: '38. How does Blood Sympathy affect Disciplines used on relatives?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q39',
        label: '39. What determines how long a vampire remains in torpor?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q40',
        label: '40. When is blood sympathy likely to be triggered? Outline the mechanic.',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    key: 'vampire_specific_rules',
    title: 'Vampire-Specific Rules',
    questions: [
      {
        key: 'q41',
        label: '41. What happens when a vampire is staked through the heart?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q42',
        label: '42. How many Vitae can a vampire spend per turn by default?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q43',
        label: '43. What is diablerie?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q44',
        label: '44. What effect does the Kiss have on mortals?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q45',
        label: '45. How much damage does sunlight cause over time?',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    key: 'covenant_powers_and_territories',
    title: 'Covenant Powers and Territories',
    questions: [
      {
        key: 'q46',
        label: '46. How do blood sorcery rituals differ from Disciplines?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q47',
        label: '47. What happens when you trespass in another vampire\'s domain?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q48',
        label: '48. What bonus does the Feeding Grounds Merit provide?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q49',
        label: '49. Besides Vitae, what do blood sorcery rituals typically cost?',
        type: 'textarea',
        required: true,
      },
      {
        key: 'q50',
        label: '50. Can Disciplines be used in Elysium?',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    key: 'bonus_questions',
    title: 'Bonus Questions',
    questions: [
      {
        key: 'q51',
        label: '51. What happens in a Clash of Wills?',
        type: 'textarea',
        required: false,
      },
      {
        key: 'q52',
        label: '52. How many dots can each Discipline have?',
        type: 'textarea',
        required: false,
      },
      {
        key: 'q53',
        label: '53. What\'s the difference between a Condition and a Tilt?',
        type: 'textarea',
        required: false,
      },
      {
        key: 'q54',
        label: '54. How do Devotions work?',
        type: 'textarea',
        required: false,
      },
      {
        key: 'q55',
        label: '55. What mechanical benefit does a coterie provide?',
        type: 'textarea',
        required: false,
      },
    ],
  },
];
