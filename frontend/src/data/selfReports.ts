/* Patient self-reports — the persona's own words at the intake desk, verbatim.
   Queen Mary is a Hong Kong hospital: a share of the synthetic cast speaks only
   Cantonese, and these authored Traditional-Chinese narratives are what Gemma
   translates on the Intake tab. Kept as a parallel lookup so the seed schema
   and the Python pipeline stay untouched. Each entry matches the patient's
   existing complaint / age / sex in patients_today.json; no self-diagnoses —
   only what the patient feels, when it started, who is with them. */

export interface SelfReport {
  lang: 'yue-Hant'
  langLabel: string
  /** who is talking, when it isn't the patient (e.g. a parent) */
  speaker?: string
  /** verbatim spoken-register Cantonese, Traditional Chinese */
  text: string
}

const CANTONESE = 'Cantonese · 廣東話'

export const SELF_REPORTS: Record<string, SelfReport> = {
  // P-2473 · 46 M · abdominal pain · ambulance
  'P-2473': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '琴晚食完飯開始肚痛，起初以為食滯，點知半夜痛到瞓唔著。今朝右邊個肚痛得犀利，彎住腰先行到兩步。太太幫我叫咗白車，佢喺出面等緊。我唔識講英文，麻煩搵人幫手。',
  },
  // P-2474 · 24 M · abdominal pain · walk-in
  'P-2474': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '尋晚同朋友食打邊爐，凌晨開始成個肚絞住咁痛，去咗三四次廁所都係屙水。而家仲有啲作嘔，飲啖水都想嘔返出嚟。我自己搭的士嚟嘅，行到，不過好攰。',
  },
  // P-2476 · 22 F · abdominal pain · ambulance
  'P-2476': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '今朝返緊工，右下邊個肚突然間好似針拮咁痛，痛到企都企唔直。同事見我面青口唇白，即刻幫我叫咗救護車。冇食過咩特別嘢，個痛越嚟越犀利。',
  },
  // P-2477 · 41 M · flank pain (renal colic) · ambulance
  'P-2477': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '今朝開工嗰陣，左邊腰好似俾人扭住咁一陣一陣痛，痛到成身汗，企都企唔穩。仲有啲想嘔，啱先去廁所見到啲尿深色咗。同事幫我叫咗白車。我唔係好識英文。',
  },
  // P-2478 · 66 F · flank pain (renal colic) · ambulance
  'P-2478': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '琴晚開始右邊腰嗰度好唔舒服，今朝痛到坐又唔係企又唔係，一陣一陣咁攪住痛。以前生過腎石，今次感覺好似嗰陣咁。個仔陪我嚟，佢去咗泊車。',
  },
  // P-2479 · 7 F · abdominal pain · walk-in — the mother speaks
  'P-2479': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    speaker: 'Mother, speaking for the patient',
    text: '我係佢媽媽。個女琴晚話肚仔痛，冇乜胃口，今朝摸落額頭仲熱熱哋。返學之前嘔咗一次，所以即刻帶佢嚟睇。佢平時好少病㗎。我哋兩母女都淨係識講廣東話。',
  },
  // P-2480 · 41 F · abdominal pain · walk-in
  'P-2480': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '兩三日前開始個肚脹住咁痛，以為係胃氣，食咗胃藥都冇用。今朝痛到喺床度起唔到身，唞咗好耐先慢慢行到出街搭車嚟。冇發燒，不過食極都冇胃口。',
  },
  // P-2481 · 44 M · injury · ambulance
  'P-2481': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '喺地盤做嘢嗰陣由梯度跌落嚟，右腳踭落地，即刻腫晒，企都企唔到。工友幫我叫咗白車。隻腳而家郁一郁都痛，要人扶先行到兩步。',
  },
  // P-2482 · 53 M · general medical · walk-in
  'P-2482': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '呢個禮拜成日都好攰，頭暈暈哋，做少少嘢就冇晒力。今朝沖涼企耐咗少少，眼前一黑，坐低唞咗一陣先好返。屋企人話唔好拖，叫我一定要嚟檢查下。我英文麻麻哋。',
  },
  // P-2484 · 61 M · injury · walk-in
  'P-2484': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '今朝喺街市買餸，落樓梯嗰陣跣咗一跣，隻左手撐住地。而家個手腕又腫又痛，攞嘢都攞唔實。隻腳冇事，自己行到嚟。我一個人嚟嘅，個女喺深圳返工。',
  },
  // P-2485 · 93 F · injury · walk-in
  'P-2485': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '尋日喺屋企廁所出嚟，絆到門檻跌咗一跤，當時以為冇事。今朝右邊髀同膊頭好痛，起身要好耐。新抱陪我嚟，佢喺出面幫我登記。我隻耳仔唔係好靈，麻煩講大聲少少。',
  },
  // P-2488 · 16 F · injury · ambulance
  'P-2488': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '踩單車落斜嗰陣閃避唔切，成個人飛咗出去，右邊手肘同膝頭哥擦損晒，塊頭好似都有撞到。有戴頭盔，不過而家覺得暈暈哋。啲途人幫我叫咗救護車，我媽媽趕緊嚟。',
  },
  // P-2489 · 50 M · palpitations · ambulance
  'P-2489': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '琴晚瞓瞓下突然覺得個心跳得好快好亂，好似漏咗一拍咁，成個人扎醒。今朝返工又嚟多次，仲有啲頭暈心慌慌。同事話我面色好差，即刻幫我叫咗白車。我識少少英文，但係一緊張就講唔出。',
  },
  // P-2490 · 47 F · abdominal pain · walk-in
  'P-2490': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '呢兩日個胃頂住頂住咁痛，食少少嘢就飽飽滯滯。今朝仲開始想嘔，成個人好唔精神。請咗半日假，自己搭巴士嚟嘅。',
  },
  // P-2491 · 56 M · chest pain · ambulance — the presenter's "serious" case
  'P-2491': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '今朝行上天橋嗰陣，個心口突然間翳住翳住咁痛，好似有嚿大石壓住咁，唞唔到大啖氣。企喺度唞咗五分鐘都唔散，左邊膊頭仲有啲拉住咁痛。路人見我唔對路，幫我叫咗白車。我唔識講英文，個女喺出面，佢識少少。',
  },
  // P-2496 · 74 F · shortness of breath (COPD) · walk-in
  'P-2496': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '呢幾日行兩步就好喘，尋晚要墊高兩個枕頭先瞓到。今朝連沖杯茶都喘到要坐低唞，仲咳咗好多痰。平時有用開個噴劑，今次噴咗都唔係好掂。個孫陪我嚟㗎。',
  },
  // P-2497 · 81 F · abdominal pain · ambulance
  'P-2497': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '琴日開始成個肚谷住谷住咁痛，去唔到廁所，今朝仲嘔咗兩次。成個人冇晒力，落床都要人扶。老人院姑娘見我唔妥，幫我叫咗白車。我聽嘢有啲慢，唔好意思。',
  },
  // P-2499 · 86 M · injury · walk-in
  'P-2499': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '尋晚喺公園散步，俾嚿唔平嘅地磚絆到，跌親膝頭哥。當時仲行到，以為冇事，今朝起身隻左膝腫咗，落樓梯要側住身行。自己慢慢行嚟嘅，唔使人扶，不過行得好慢。',
  },
  // P-2507 · 57 M · shortness of breath (COPD) · ambulance
  'P-2507': {
    lang: 'yue-Hant',
    langLabel: CANTONESE,
    text: '今朝起身開始喘得好犀利，講兩句嘢就要唞，行去廁所都要停兩次。個噴劑噴咗幾次都冇乜用，胸口仲覺得好緊。屋企人見我嘴唇有啲紫，即刻叫咗白車。之前都試過一次咁樣，今次辛苦好多。',
  },
}

export const selfReportFor = (id: string): SelfReport | null => SELF_REPORTS[id] ?? null
