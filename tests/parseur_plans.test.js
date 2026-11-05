// Tests du parseur de noms de plans. Usage : node tests/parseur_plans.test.js
// Extrait le bloc entre les marqueurs du userscript (pas de copie du code a maintenir).
var fs = require('fs'), assert = require('assert'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'foxyz-creation-articles.user.js'), 'utf8');
var a = src.indexOf('// ===== DEBUT PARSEUR PLANS'), b = src.indexOf('// ===== FIN PARSEUR PLANS');
assert(a > 0 && b > a, 'marqueurs du parseur introuvables');
var P = new Function(src.slice(a, b) + '; return { analyserNomPlan: analyserNomPlan, cleGed: cleGed, sansExtension: sansExtension, resoudreTypeDoc: resoudreTypeDoc };')();
var n = 0;
function t(nom, f) { try { f(); n++; console.log('ok   ' + nom); } catch (e) { console.log('ECHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } }
function champs(nomFichier, attendu) {
  var r = P.analyserNomPlan(nomFichier);
  Object.keys(attendu).forEach(function (k) { assert.deepStrictEqual(r[k], attendu[k], k + ' : ' + JSON.stringify(r[k]) + ' au lieu de ' + JSON.stringify(attendu[k])); });
}

t('plan ST complet', function () { champs('E-600-07-A INSERTS (PLAN ST).PDF', { ok: true, reference_article: 'E-600-07-A', reference_doc: 'E-600-07', indice: 'A', indice_defaut: false, designation: 'INSERTS', suffixe: 'PLAN ST', mot_cle_type: 'SOUS TRAITANCE', a_completer: [] }); });
t('plan ST, designation de 2 mots', function () { champs('E-600-08-A INSERT BISEAU (PLAN ST).PDF', { reference_article: 'E-600-08-A', designation: 'INSERT BISEAU' }); });
t('plan ST fixation', function () { champs('E-680-01-A FIXATION (PLAN ST).PDF', { reference_doc: 'E-680-01', indice: 'A', designation: 'FIXATION' }); });
t('plan client : tout vide, a completer', function () { champs('E3.12.04301_B.pdf', { ok: true, reference_article: '', reference_doc: '', indice: '', designation: '', a_completer: ['reference', 'indice', 'designation'] }); });
t('plan de coulee : pas de reference, designation gardee avec Ø', function () { champs('P.C. PINCE Ø13.3.PDF', { ok: true, prefixe: 'P.C', reference_article: '', designation: 'PINCE Ø13.3', mot_cle_type: 'COULEE', a_completer: ['reference', 'indice'] }); });
t('plan d\'ensemble : ref sans indice => A par defaut', function () { champs("P.E-F-946-NEZ D'ETIQUETAGE OVALE 31X13.PDF", { reference_doc: 'F-946', indice: 'A', indice_defaut: true, reference_article: 'F-946-A', designation: "NEZ D'ETIQUETAGE OVALE 31X13", mot_cle_type: 'ENSEMBLE', a_completer: [] }); });
t('indice de 3 lettres refuse comme indice', function () { champs('E-001-12-ABC PIECE.pdf', { indice: 'A', indice_defaut: true, designation: 'ABC PIECE' }); });
t('indice de 2 lettres accepte', function () { champs('E-001-12-AB PIECE.pdf', { indice: 'AB', reference_article: 'E-001-12-AB' }); });
t('extension en minuscules', function () { champs('E-001-12-B PION.pdf', { ok: true, indice: 'B' }); });
t('tirets dans la designation', function () { champs('E-001-12-B PION - DE CENTRAGE (PLAN ST).PDF', { designation: 'PION - DE CENTRAGE' }); });
t('suffixe inconnu : conserve, pas de type devine', function () { champs('E-001-12-B PION (PLAN XY).PDF', { ok: true, suffixe: 'PLAN XY', mot_cle_type: '' }); });
t('accents conserves, mis en majuscules', function () { champs('E-001-12-B écrou spécial.pdf', { designation: 'ÉCROU SPÉCIAL' }); });
t('docx refuse', function () { champs('CDC Réalisation godets.docx', { ok: false, erreur: 'PDF attendu' }); });
t('nom vide refuse', function () { champs('.pdf', { ok: false }); });
t('null refuse', function () { assert.strictEqual(P.analyserNomPlan(null).ok, false); });

// Cle GED : original (disque) contre nom renomme par Foxyz (observe sur TEMP, DIAGNOSTIC section 3)
[['E-680-01-A FIXATION (PLAN ST).PDF', 'E_680_01_A_FIXATION__PLAN_ST_.PDF'],
 ['E3.12.04301_B.pdf', 'E3_12_04301_B.pdf'],
 ['P.C. PINCE Ø13.3.PDF', 'P_C__PINCE_O13_3.PDF'],
 ["P.E-F-946-NEZ D'ETIQUETAGE OVALE 31X13.PDF", 'P_E_F_946_NEZ_D_ETIQUETAGE_OVALE_31X13.PDF'],
 ['CDC Réalisation godets type WECKERLE SHOCK SHINE-Ligne M31.docx', 'CDC_Realisation_godets_type_WECKERLE_SHOCK_SHINE_Ligne_M31.docx'],
 ['ZZ-TEST-02-B ÉCROU spécial (M8) n°2 (PLAN FAB).pdf', 'ZZ_TEST_02_B_ECROU_special__M8__n2__PLAN_FAB_.pdf']
].forEach(function (c) {
  t('cle GED : ' + c[0], function () { assert.strictEqual(P.cleGed(P.sansExtension(c[0])), P.cleGed(P.sansExtension(c[1]))); });
});
t('cle GED : deux plans differents => cles differentes', function () { assert.notStrictEqual(P.cleGed('E-600-07-A INSERTS'), P.cleGed('E-600-08-A INSERT BISEAU')); });
var TEMP = ['Plan', "PLAN D'ENSEMBLE", 'PLAN SOUS TRAITANCE', 'Plans'];
var PROD = ['Plan', 'PLAN DE COULÉE', 'PLAN DE FABRICATION', 'PLAN DE SOUS TRAITANCE'];
t('type : sous-traitance sur TEMP', function () { assert.strictEqual(P.resoudreTypeDoc('SOUS TRAITANCE', TEMP), 'PLAN SOUS TRAITANCE'); });
t('type : sous-traitance sur PROD', function () { assert.strictEqual(P.resoudreTypeDoc('SOUS TRAITANCE', PROD), 'PLAN DE SOUS TRAITANCE'); });
t('type : coulee (accent) sur PROD', function () { assert.strictEqual(P.resoudreTypeDoc('COULEE', PROD), 'PLAN DE COULÉE'); });
t("type : ensemble sur TEMP", function () { assert.strictEqual(P.resoudreTypeDoc('ENSEMBLE', TEMP), "PLAN D'ENSEMBLE"); });
t('type : absent de la liste => vide', function () { assert.strictEqual(P.resoudreTypeDoc('ENSEMBLE', PROD), ''); });
t('type : ambigu => vide', function () { assert.strictEqual(P.resoudreTypeDoc('PLAN', TEMP), ''); });
t('type : pas de mot-cle => vide', function () { assert.strictEqual(P.resoudreTypeDoc('', TEMP), ''); });
console.log(n + ' tests ok');
