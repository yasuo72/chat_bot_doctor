// Core MediGuideBackend engine: pure function that maps input JSON -> structured JSON output

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toLower(value) {
  return normalizeText(value).toLowerCase();
}

function hasSymptomWords(text) {
  const keywords = [
    'pain',
    'fever',
    'temperature',
    'cough',
    'cold',
    'vomit',
    'vomiting',
    'loose motion',
    'diarrhoea',
    'diarrhea',
    'headache',
    'breath',
    'short of breath',
    'shortness of breath',
    'choking',
    'rash',
    'infection',
    'bleeding',
    'dizzy',
    'dizziness',
    'weakness'
  ];
  for (let i = 0; i < keywords.length; i += 1) {
    if (text.indexOf(keywords[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function detectHinglish(text) {
  const hinglishHints = [
    'hai',
    'nahi',
    'nahin',
    'haan',
    'dard',
    'bukhar',
    'khansi',
    'sardi',
    'thoda',
    'zyada',
    'bahut',
    'pet',
    'sir',
    'chakkar'
  ];
  for (let i = 0; i < hinglishHints.length; i += 1) {
    if (text.indexOf(hinglishHints[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function detectIntent(session, messageText, context) {
  const text = toLower(messageText);
  const chatMode = session && session.chatMode;
  let type = 'general_health';
  let confidence = 0.5;

  if (chatMode === 'symptom_triage' ||
      chatMode === 'report_explain' ||
      chatMode === 'prescription_explain' ||
      chatMode === 'medication_reminder' ||
      chatMode === 'general_health' ||
      chatMode === 'emergency_help') {
    type = chatMode;
    confidence = 0.85;
    return { type, confidence };
  }

  if (text.indexOf('report') !== -1 ||
      text.indexOf('lab result') !== -1 ||
      text.indexOf('test result') !== -1) {
    type = 'report_explain';
    confidence = 0.7;
  } else if (text.indexOf('prescription') !== -1 ||
             text.indexOf('tablet') !== -1 ||
             text.indexOf('capsule') !== -1 ||
             text.indexOf('mg ') !== -1) {
    type = 'prescription_explain';
    confidence = 0.65;
  } else if (text.indexOf('remind') !== -1 ||
             text.indexOf('reminder') !== -1) {
    type = 'medication_reminder';
    confidence = 0.7;
  } else if (text.indexOf('emergency') !== -1 ||
             text.indexOf('ambulance') !== -1 ||
             text.indexOf('er ') !== -1) {
    type = 'emergency_help';
    confidence = 0.75;
  } else if (hasSymptomWords(text)) {
    type = 'symptom_triage';
    confidence = 0.75;
  }

  return { type, confidence };
}

function detectSafetyAndTriage(messageText, userProfile) {
  const text = toLower(messageText);
  const redFlags = [];

  if (text.indexOf('chest pain') !== -1 ||
      text.indexOf('pressure in chest') !== -1 ||
      (text.indexOf('shortness of breath') !== -1 && text.indexOf('mild') === -1) ||
      (text.indexOf('short of breath') !== -1 && text.indexOf('mild') === -1)) {
    redFlags.push('Possible heart or lung emergency (chest pain or severe breathlessness)');
  }

  if (text.indexOf('fainting') !== -1 ||
      text.indexOf('fainted') !== -1 ||
      text.indexOf('passed out') !== -1 ||
      text.indexOf('loss of consciousness') !== -1) {
    redFlags.push('Fainting or loss of consciousness');
  }

  if (text.indexOf('face droop') !== -1 ||
      text.indexOf('slurred speech') !== -1 ||
      text.indexOf('speech trouble') !== -1 ||
      text.indexOf('arm weakness') !== -1 ||
      text.indexOf('stroke') !== -1) {
    redFlags.push('Possible stroke symptoms');
  }

  if (text.indexOf('swelling of face') !== -1 ||
      text.indexOf('swelling of tongue') !== -1 ||
      text.indexOf('wheezing') !== -1 ||
      (text.indexOf('trouble breathing') !== -1 && text.indexOf('mild') === -1)) {
    redFlags.push('Possible severe allergic reaction with breathing issues');
  }

  if (text.indexOf('vomiting blood') !== -1 ||
      text.indexOf('blood in vomit') !== -1 ||
      text.indexOf('black stool') !== -1 ||
      text.indexOf('black stools') !== -1 ||
      text.indexOf('uncontrolled bleeding') !== -1) {
    redFlags.push('Serious bleeding or blood in vomit/stools');
  }

  if (text.indexOf('severe headache') !== -1 ||
      text.indexOf('worst headache') !== -1) {
    if (text.indexOf('confusion') !== -1 || text.indexOf('stiff neck') !== -1) {
      redFlags.push('Severe headache with confusion or stiff neck');
    }
  }

  if (text.indexOf('seizure') !== -1 ||
      text.indexOf('seizures') !== -1 ||
      text.indexOf('convulsion') !== -1 ||
      text.indexOf('fits') !== -1) {
    redFlags.push('Seizure activity');
  }

  if (text.indexOf('suicidal') !== -1 ||
      text.indexOf('kill myself') !== -1 ||
      text.indexOf('end my life') !== -1 ||
      text.indexOf('self harm') !== -1 ||
      text.indexOf('self-harm') !== -1) {
    redFlags.push('Suicidal thoughts or self-harm risk');
  }

  const isPregnant = userProfile && userProfile.pregnant === true;
  if ((text.indexOf('pregnant') !== -1 || isPregnant) &&
      (text.indexOf('heavy bleeding') !== -1 ||
       text.indexOf('severe abdominal pain') !== -1 ||
       text.indexOf('severe stomach pain') !== -1)) {
    redFlags.push('Pregnancy with heavy bleeding or severe abdominal pain');
  }

  if (text.indexOf('no urine') !== -1 ||
      text.indexOf('not passing urine') !== -1 ||
      text.indexOf('very less urine') !== -1 ||
      text.indexOf('extreme weakness') !== -1 ||
      text.indexOf('too weak to stand') !== -1) {
    redFlags.push('Possible severe dehydration');
  }

  // High fever in very young infant (<3 months) as an emergency red flag
  const hasAge = typeof userProfile.age === 'number' && userProfile.age >= 0;
  const isInfantUnderThreeMonths = hasAge && userProfile.age < 0.3;
  if (isInfantUnderThreeMonths &&
      (text.indexOf('fever') !== -1 ||
       text.indexOf('high fever') !== -1 ||
       text.indexOf('temperature') !== -1)) {
    redFlags.push('High fever in infant under 3 months');
  }

  let level = 'SELF_CARE';
  let reason = 'Minor symptoms without clear emergency signs.';

  const urgentHints = [];
  if (text.indexOf('very high fever') !== -1 ||
      text.indexOf('105') !== -1 ||
      text.indexOf('104') !== -1) {
    urgentHints.push('Very high fever');
  }
  if (text.indexOf('severe pain') !== -1 ||
      text.indexOf('worst pain') !== -1 ||
      text.indexOf('cant walk') !== -1 ||
      text.indexOf("can't walk") !== -1) {
    urgentHints.push('Severe or disabling pain');
  }
  if (text.indexOf('difficulty breathing') !== -1 ||
      text.indexOf('breathing fast') !== -1 ||
      text.indexOf('breathless') !== -1) {
    urgentHints.push('Breathing discomfort');
  }
  if (text.indexOf('fracture') !== -1 ||
      text.indexOf('broken bone') !== -1) {
    urgentHints.push('Possible fracture');
  }
  if (text.indexOf('vomiting') !== -1 &&
      (text.indexOf('2 days') !== -1 ||
       text.indexOf('three days') !== -1 ||
       text.indexOf('3 days') !== -1)) {
    urgentHints.push('Persistent vomiting');
  }

  // Infection with important risk factors (e.g., diabetes, immunocompromised)
  const knownConditions = Array.isArray(userProfile.knownConditions)
    ? userProfile.knownConditions.map((c) => String(c).toLowerCase())
    : [];
  const hasInfectionWord =
    text.indexOf('infection') !== -1 ||
    text.indexOf('pus') !== -1 ||
    text.indexOf('cellulitis') !== -1;
  const riskWords = [
    'diabetes',
    'immunocompromised',
    'hiv',
    'cancer',
    'chemotherapy',
    'steroid',
    'transplant',
    'kidney failure',
    'liver failure'
  ];
  const hasRiskFactor = knownConditions.some((cond) =>
    riskWords.some((risk) => cond.indexOf(risk) !== -1)
  );
  if (hasInfectionWord && hasRiskFactor) {
    urgentHints.push('Infection with important risk factors (e.g., diabetes or immunocompromised).');
  }

  if (redFlags.length > 0) {
    level = 'EMERGENCY';
    reason = 'One or more emergency red-flag symptoms mentioned.';
  } else if (urgentHints.length > 0) {
    level = 'URGENT';
    reason = 'Concerning symptoms that should be reviewed by a doctor today.';
  } else if (hasSymptomWords(text)) {
    level = 'CLINIC_VISIT';
    reason = 'Symptoms likely need clinic evaluation if not improving.';
  }

  const safety = {
    redFlagsDetected: redFlags.length > 0,
    redFlags: redFlags,
    emergencyInstruction: redFlags.length > 0
      ? 'This may be an emergency. Call your local emergency number or go to the nearest emergency department immediately. Do not rely only on online advice.'
      : ''
  };

  const triage = {
    level: level,
    reason: reason
  };

  return { triage: triage, safety: safety };
}

function truncateText(text, maxLength) {
  const clean = normalizeText(text);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 3) + '...';
}

function buildAssistantMessage(params) {
  const intent = params.intent;
  const triage = params.triage;
  const input = params.input;
  const safety = params.safety;
  const messageText = normalizeText(input && input.message && input.message.text);
  const lower = messageText.toLowerCase();
  const isHinglish = detectHinglish(lower);

  const summaryPrefix = isHinglish
    ? 'Aapne jo symptoms bataye hain, uske basis par main safe guidance de raha hoon.'
    : 'Based on what you shared, here is a safe, general guidance plan.';

  let title;
  if (triage.level === 'EMERGENCY') {
    title = isHinglish ? 'Yeh emergency ho sakti hai' : 'Possible emergency – act now';
  } else if (triage.level === 'URGENT') {
    title = isHinglish ? 'Aaj hi doctor ko dikhaiye' : 'Needs same-day medical review';
  } else if (intent.type === 'report_explain') {
    title = isHinglish ? 'Report ka simple summary' : 'Lab / report explanation';
  } else if (intent.type === 'prescription_explain') {
    title = isHinglish ? 'Prescription samajhne mein madad' : 'Prescription explanation';
  } else if (intent.type === 'medication_reminder') {
    title = isHinglish ? 'Dawaai yaad dilane ki planning' : 'Medication reminder planning';
  } else if (intent.type === 'symptom_triage') {
    title = isHinglish ? 'Symptom triage guidance' : 'Symptom triage guidance';
  } else {
    title = isHinglish ? 'General health guidance' : 'General health guidance';
  }

  const understood = truncateText(messageText || 'your health concern', 140);
  const summary = isHinglish
    ? 'Aapne jo concern bataya hai ("' + understood + '"), usko dhyan se dekh kar next steps bata raha hoon.'
    : 'You mentioned: "' + understood + '". I will outline likely causes and safe next steps.';

  let possibleCauses = [];

  if (triage.level === 'EMERGENCY') {
    possibleCauses = [
      {
        name: isHinglish ? 'Serious medical emergency' : 'Serious medical emergency',
        whyPossible: isHinglish
          ? 'Message mein kuch aise red-flag symptoms hain jo jaanleva ho sakte hain.'
          : 'Your description includes red-flag symptoms that can be life-threatening.'
      }
    ];
  } else if (intent.type === 'report_explain') {
    possibleCauses = [
      {
        name: isHinglish ? 'Mild ya moderate findings' : 'Mild or moderate changes',
        whyPossible: isHinglish
          ? 'Reports mein aise values ho sakte hain jo monitoring aur lifestyle se better hote hain.'
          : 'Reports may show values that improve with lifestyle and monitoring.'
      },
      {
        name: isHinglish ? 'Doctor review ki zarurat' : 'Need for doctor review',
        whyPossible: isHinglish
          ? 'Abnormal values ko doctor ko dikha kar confirm karna zaruri hai.'
          : 'Any significantly abnormal values must be confirmed and interpreted by a doctor.'
      }
    ];
  } else if (intent.type === 'prescription_explain') {
    possibleCauses = [
      {
        name: isHinglish ? 'Symptom control ke liye medicines' : 'Medicines for symptom control',
        whyPossible: isHinglish
          ? 'Prescription aam taur par dard, bukhar, infection ya BP/sugar control ke liye hota hai.'
          : 'Prescriptions are usually for controlling pain, fever, infection, or chronic conditions.'
      },
      {
        name: isHinglish ? 'Side effects monitor karna' : 'Need to monitor for side effects',
        whyPossible: isHinglish
          ? 'Har medicine ke kuch side effects ho sakte hain, jo doctor se discuss karne chahiye.'
          : 'All medicines can have side effects that should be discussed with your doctor.'
      }
    ];
  } else if (intent.type === 'medication_reminder') {
    possibleCauses = [
      {
        name: isHinglish ? 'Regular dosing ka schedule' : 'Need for consistent dosing schedule',
        whyPossible: isHinglish
          ? 'Dawaai ka regular time follow karne se BP, sugar ya dusri conditions better control mein rehti hain.'
          : 'Keeping a regular schedule for medicines helps keep conditions like blood pressure or diabetes under control.'
      },
      {
        name: isHinglish ? 'Missed dose safety' : 'Safe handling of missed doses',
        whyPossible: isHinglish
          ? 'Agar dose miss ho jaye to generally double dose lena safe nahi hota, isliye clear plan zaruri hai.'
          : 'If a dose is missed, it is usually not safe to double the next dose, so a clear plan is important.'
      }
    ];
  } else if (intent.type === 'symptom_triage') {
    possibleCauses = [
      {
        name: isHinglish ? 'Common viral ya minor illness' : 'Common viral or minor illness',
        whyPossible: isHinglish
          ? 'Bahut se cases mein bukhar, khansi, halka dard viral infection se hota hai.'
          : 'Many cases of fever, cough, or mild pain are due to viral or minor illnesses.'
      },
      {
        name: isHinglish ? 'Serious cause ko rule out karna' : 'Need to rule out serious causes',
        whyPossible: isHinglish
          ? 'Agar symptoms severe ho ya lamba chale to serious problem ko rule out karna zaruri hai.'
          : 'If symptoms are severe or persistent, serious problems must be ruled out by a doctor.'
      }
    ];
  } else {
    possibleCauses = [
      {
        name: isHinglish ? 'Lifestyle ya minor health issue' : 'Lifestyle or minor health issue',
        whyPossible: isHinglish
          ? 'Message se lagta hai ki yeh general health/lifestyle related concern ho sakta hai.'
          : 'Your description fits a general health or lifestyle-related concern.'
      },
      {
        name: isHinglish ? 'Doctor review agar doubt ho' : 'Doctor review if any doubt',
        whyPossible: isHinglish
          ? 'Agar confusion ya worry zyada hai to doctor ko directly dikhana best hai.'
          : 'If you remain worried or confused, direct review with a doctor is best.'
      }
    ];
  }

  let whatToDoNow;
  if (triage.level === 'EMERGENCY') {
    whatToDoNow = isHinglish
      ? [
          'Turant apne local emergency number par call karein ya sabse kareebi emergency department jaayen.',
          'Akele drive na karein, kisi ko saath le kar ya ambulance se jaayen.',
          'Online advice ke bharose na rahein jab tak doctor ne aapko directly na dekh liya ho.'
        ]
      : [
          'Call your local emergency number or go to the nearest emergency department immediately.',
          'Do not drive yourself if you feel weak, dizzy, or breathless. Ask someone to accompany you or use an ambulance.',
          'Do not rely only on online advice until a doctor has examined you in person.'
        ];
  } else if (triage.level === 'URGENT') {
    whatToDoNow = isHinglish
      ? [
          'Aaj hi nearby clinic/doctor se appointment lein.',
          'Pichhle kuch ghanton/dinon ka symptom pattern note karein (fever kitna, dard kahan, kab badhta hai).',
          'Hydration maintain rakhein (pani, ORS, clear fluids), lekin agar bar-bar vomit ho raha ho to sip-sip kar ke piyen.'
        ]
      : [
          'Arrange a same-day visit with a nearby clinic or doctor.',
          'Note the pattern of your symptoms over the last hours/days (where it hurts, when it worsens, any triggers).',
          'Keep hydrated with water or oral rehydration solutions; take small, frequent sips if you feel nauseated.'
        ];
  } else if (triage.level === 'CLINIC_VISIT') {
    whatToDoNow = isHinglish
      ? [
          'Agle 24–72 ghanton mein doctor/clinic se check-up plan karein.',
          'Ghar par rest karein, hydration aur halka, healthy khana lein.',
          'Jo bhi medicines abhi le rahe hain, unka naam aur dose likh kar rakh lein (apne doctor se bina pooche medicine band na karein).'
        ]
      : [
          'Plan a visit to a clinic or doctor within the next 24–72 hours, especially if symptoms persist.',
          'Rest at home, stay well hydrated, and eat light, healthy meals as tolerated.',
          'Keep a list of all current medicines and doses; do not stop prescribed medicines without talking to your doctor.'
        ];
  } else {
    whatToDoNow = isHinglish
      ? [
          'Abhi ke liye mild self-care (rest, pani, halka khana) follow karein.',
          'Symptoms ka daily note banaayein (kab start hua, better/ worse ho raha hai ya nahi).',
          'Agar aapko allergy, pregnancy, liver ya kidney ki problem hai to koi bhi nayi medicine lene se pehle doctor se pooch lein.'
        ]
      : [
          'For now, use mild self-care such as rest, fluids, and light food if you can eat.',
          'Keep a simple daily log of your symptoms (when they started, whether they are improving or worsening).',
          'If you have allergies, are pregnant, or have liver/kidney problems, check with a doctor before starting any new medicine.'
        ];
  }

  // Medication reminder specific guidance for non-emergency cases
  if (intent.type === 'medication_reminder' && triage.level !== 'EMERGENCY') {
    whatToDoNow = isHinglish
      ? [
          'Har medicine ke liye ek fixed time (subah/shaam) decide karein aur roz roughly wahi time follow karein.',
          'Simple reminders use karein (phone alarm, app ya likh kar note) taki dose miss na ho.',
          'Agar kabhi dose miss ho jaye to generally next time double dose na lein; apne doctor ya chemist se confirm karein.'
        ]
      : [
          'Choose fixed times for each medicine (for example, morning and/or evening) and try to keep them consistent every day.',
          'Use simple reminders (phone alarm, app, or written notes) so that doses are not missed.',
          'If you accidentally miss a dose, in general do not double the next dose; ask your doctor or pharmacist what to do.'
        ];
  }

  let whenToSeekCare;
  if (triage.level === 'EMERGENCY') {
    whenToSeekCare = isHinglish
      ? ['Bilkul turant emergency care lein – wait mat karein.']
      : ['Seek emergency care immediately – do not wait for symptoms to improve.'];
  } else if (triage.level === 'URGENT') {
    whenToSeekCare = isHinglish
      ? [
          'Aaj ke andar doctor ko zarur dikhaiye.',
          'Agar breathing aur zyada difficult ho, chest pain aaye, severe confusion ya fainting ho to emergency department jaayen.'
        ]
      : [
          'See a doctor in person today (same-day visit).',
          'Go to an emergency department if you develop trouble breathing, chest pain, severe confusion, or fainting.'
        ];
  } else {
    whenToSeekCare = isHinglish
      ? [
          'Agar symptoms 2–3 din mein better na ho ya naya severe symptom aaye to doctor ko dikhaiye.',
          'Breathing problem, chest pain, severe headache with confusion, ya uncontrolled bleeding ho to emergency care lein.'
        ]
      : [
          'See a doctor if symptoms do not improve within 2–3 days or if they get worse.',
          'Seek emergency care for trouble breathing, chest pain, severe headache with confusion, seizures, or uncontrolled bleeding.'
        ];
  }

  if (intent.type === 'medication_reminder' && triage.level !== 'EMERGENCY') {
    whenToSeekCare = isHinglish
      ? [
          'Agar aap baar-baar dose miss kar rahe hain ya lagta hai ki BP/sugar ya symptoms control mein nahi hain to doctor se consult karein.',
          'Agar overdose ka doubt ho, severe allergy, breathing problem, chest pain ya confusion ho to turant emergency care lein.'
        ]
      : [
          'Contact your doctor if you are missing doses frequently or feel that your blood pressure, sugar, or symptoms are not controlled.',
          'Seek urgent or emergency care if you suspect an overdose or develop severe allergy, breathing trouble, chest pain, or confusion.'
        ];
  }

  let questions = [];
  const context = input && input.context;
  const lastMessages = (context && context.lastMessages) || [];

  if (intent.type === 'symptom_triage' && lastMessages.length < 2 && triage.level !== 'EMERGENCY') {
    questions = isHinglish
      ? [
          'Yeh problem ko kitne din/ghante ho gaye hain?',
          'Pain/fever ki intensity kitni hai (1 se 10 tak)?',
          'Kya aapko fever, breathing problem, chest pain ya extreme weakness bhi hai?',
          'Koi chronic condition (diabetes, BP, heart, asthma) ya pregnancy hai kya?'
        ]
      : [
          'How long have these symptoms been present (hours/days)?',
          'How strong is the pain or discomfort on a scale from 1 to 10?',
          'Do you have any fever, breathing difficulty, chest pain, or extreme weakness?',
          'Do you have any chronic conditions (like diabetes, high BP, heart, asthma) or are you pregnant?'
        ];
  } else if (intent.type === 'report_explain' && lastMessages.length < 2) {
    questions = isHinglish
      ? [
          'Yeh report kis type ki hai (blood test, scan, ECG, etc.)?',
          'Doctor ne is report se related kya bataya ya plan diya hai?',
          'Koi aisa value ya term jo aapko sabse zyada confuse kar raha hai?'
        ]
      : [
          'What type of report is this (blood test, scan, ECG, etc.)?',
          'What has your doctor already explained or planned based on this report?',
          'Which specific value or term in the report is most confusing to you?'
        ];
  }

  if (intent.type === 'medication_reminder' && questions.length === 0) {
    questions = isHinglish
      ? [
          'Kaun-kaun si medicines ke liye reminder chahiye (jaise BP tablet, diabetes ki dawaai, etc.)?',
          'Har medicine din mein kitni baar leni hoti hai (ek baar, do baar, etc.)?',
          'Kya kisi medicine ko khaane ke saath ya kisi specific time (jaise sirf raat ko) lena hota hai?',
          'Doctor ne in medicines ko kitne time tak continue karne ko bola hai?'
        ]
      : [
          'Which medicines do you want reminders for (for example, BP tablet, diabetes medicine)?',
          'How many times a day do you take each one (once, twice, etc.)?',
          'Do any medicines need to be taken with food or only at a specific time (like only at night)?',
          'For how long has your doctor asked you to continue these medicines?'
        ];
  }

  let doctorVisitPrep;
  if (intent.type === 'report_explain' || intent.type === 'prescription_explain') {
    doctorVisitPrep = isHinglish
      ? [
          'Report/prescription ki copy (hard copy ya photo) saath le kar jaayen.',
          'Jo bhi symptoms, duration aur pehle se chal rahe medicines hain unka list likh kar rakh lein.',
          'Apne sawal pehle se likh lein taki consult ke time sab puch sakein.'
        ]
      : [
          'Carry a copy or clear photo of your report/prescription to the visit.',
          'Write down your main symptoms, how long they have been present, and all current medicines.',
          'Prepare a short list of questions so you can use the consultation time well.'
        ];
  } else if (intent.type === 'medication_reminder') {
    doctorVisitPrep = isHinglish
      ? [
          'Apni saari medicines ka naam, dose aur kitni baar roz lena hota hai uska list bana kar doctor ke paas jaayen.',
          'Doctor ko honestly batayein ki kab-kab dose miss hui hai taki woh safe tareeke se plan adjust kar saken.',
          'Doctor ya chemist se clear likhwa lein ki agar future mein dose miss ho jaye to kya karna hai.'
        ]
      : [
          'Carry a full list of all your medicines, their doses, and how many times a day you take each.',
          'Tell your doctor honestly how often you miss doses so they can adjust the plan safely.',
          'Ask your doctor or pharmacist to clearly explain what to do if you miss a dose in the future.'
        ];
  } else {
    doctorVisitPrep = isHinglish
      ? [
          'Symptom timeline (kab start hua, kab worse/better hua) note karein.',
          'Current medicines, allergies, aur past medical history ka short summary bana lein.',
          'Agar possible ho to kisi trusted family member ko saath le kar doctor ke paas jaayen.'
        ]
      : [
          'Note a simple timeline of your symptoms (when they started, what makes them better or worse).',
          'Prepare a list of your current medicines, allergies, and important past medical history.',
          'If possible, take a trusted family member or friend with you for support during the visit.'
        ];
  }

  return {
    title: title,
    summary: summaryPrefix + ' ' + summary,
    possibleCauses: possibleCauses,
    whatToDoNow: whatToDoNow,
    whenToSeekCare: whenToSeekCare,
    questions: questions,
    doctorVisitPrep: doctorVisitPrep
  };
}

function buildActions(params) {
  const triage = params.triage;
  const intent = params.intent;
  const suggestedButtons = [];

  if (triage.level === 'EMERGENCY') {
    suggestedButtons.push({ id: 'call_emergency', label: 'Call emergency services' });
  }

  if (intent.type === 'symptom_triage') {
    suggestedButtons.push({ id: 'share_symptoms', label: 'Share more symptoms' });
  }

  if (triage.level === 'CLINIC_VISIT' || triage.level === 'URGENT') {
    suggestedButtons.push({ id: 'find_nearby_clinic', label: 'Find nearby clinic' });
  }

  if (intent.type === 'report_explain') {
    suggestedButtons.push({ id: 'upload_report', label: 'Attach another report' });
  }

  if (suggestedButtons.length === 0) {
    suggestedButtons.push({ id: 'share_symptoms', label: 'Share more details' });
  }

  const nextMode = intent.type || 'symptom_triage';

  return {
    suggestedButtons: suggestedButtons,
    nextMode: nextMode
  };
}

function buildDevSection(params) {
  const input = params.input || {};
  const intent = params.intent || {};
  const triage = params.triage || {};
  const userProfile = input.userProfile || {};

  const missingCriticalInfo = [];

  if (!userProfile.age && userProfile.age !== 0) {
    missingCriticalInfo.push('age');
  }
  if (!userProfile.sex) {
    missingCriticalInfo.push('sex');
  }
  if (intent.type === 'symptom_triage') {
    missingCriticalInfo.push('duration');
    missingCriticalInfo.push('severity');
    missingCriticalInfo.push('temperature');
  }
  if (userProfile.sex === 'female' && (userProfile.pregnant === null || userProfile.pregnant === undefined)) {
    missingCriticalInfo.push('pregnancy_status');
  }

  let notes = '';
  if (triage.level === 'EMERGENCY') {
    notes = 'Escalate to emergency UI with clear call button and safety banner.';
  } else if (triage.level === 'URGENT') {
    notes = 'Highlight same-day doctor visit recommendation in UI.';
  } else if (intent.type === 'report_explain') {
    notes = 'Render a report summary card with key findings and questions for doctor.';
  }

  return {
    missingCriticalInfo: missingCriticalInfo,
    notesForBackend: notes
  };
}

function handleChat(input) {
  const safeInput = input || {};
  const session = safeInput.session || {};
  const userProfile = safeInput.userProfile || {};
  const context = safeInput.context || {};
  const messageObj = safeInput.message || {};
  const messageText = normalizeText(messageObj.text || '');

  const intent = detectIntent(session, messageText, context);
  const triageAndSafety = detectSafetyAndTriage(messageText, userProfile);
  const triage = triageAndSafety.triage;
  const safety = triageAndSafety.safety;

  const assistantMessage = buildAssistantMessage({
    intent: intent,
    triage: triage,
    input: safeInput,
    safety: safety
  });

  const actions = buildActions({ intent: intent, triage: triage });
  const dev = buildDevSection({ input: safeInput, intent: intent, triage: triage });

  const locale = normalizeText(session.locale || 'en');
  const language = locale.split('-')[0] || 'en';

  const meta = {
    engine: 'MediGuideBackend',
    version: '1.0',
    timestampISO: new Date().toISOString(),
    language: language
  };

  return {
    meta: meta,
    intent: intent,
    triage: triage,
    safety: safety,
    assistantMessage: assistantMessage,
    actions: actions,
    dev: dev
  };
}

module.exports = {
  handleChat: handleChat
};
