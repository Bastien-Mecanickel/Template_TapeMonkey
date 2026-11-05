# Snippets de diagnostic console (Foxyz)

Bouts de code a coller dans la console du navigateur (F12) pour decouvrir des IDs
ou verifier un comportement AVANT de modifier le userscript. Tous utilisent
`copy(...)` pour deposer le resultat dans le presse-papier.

Rappel methode : on code jamais "a l'aveugle". On ouvre une fiche, on lance le
diagnostic, on lit les vrais IDs, PUIS on cable.

---

## 1. Lister tous les champs visibles d'un formulaire

A lancer apres avoir ouvert/charge le formulaire concerne.

```js
$('#cadre_total_formulaire input:visible, #cadre_total_formulaire textarea:visible, #cadre_total_formulaire select:visible').each(function(i){
  console.log(`[${i}] <${this.tagName.toLowerCase()}> type="${this.type}" id="${this.id}" name="${this.name}" placeholder="${this.placeholder}"`);
});
```

Variante "tous les champs de la page" (pas seulement le popup) :

```js
(function(){
  let out='';
  $('input:visible, textarea:visible, select:visible').each(function(){
    out += `<${this.tagName.toLowerCase()}> type="${this.type}" id="${this.id}" name="${this.name}" ph="${this.placeholder}" val="${($(this).val()||'').toString().slice(0,60)}"\n`;
  });
  try{copy(out);}catch(e){}
  console.log(out);
})();
```

---

## 2. Detecter les lignes ANNULEES (marqueur confirme : classe `bord_rouge`)

Le conteneur d'une ligne = `.ligne_devis`. Une ligne annulee recoit en plus la
classe `bord_rouge`. C'est LE test fiable, par ligne (ne pas se fier au texte
"Ligne annulee / Rouvrir", qui deborde d'un bloc a l'autre).

```js
(function(){
  const $=window.$;
  for(let n=1;n<=60;n++){
    const c=document.getElementById('reference_article_'+n);
    if(!c) continue;
    const cont=c.closest('.ligne_devis');
    const annulee=!!(cont&&cont.classList.contains('bord_rouge'));
    console.log('ligne '+n+' -> '+(annulee?'ANNULEE':'active')+'  ref="'+($(c).val()||'').slice(0,32)+'"');
  }
})();
```

---

## 3. Pont ligne sequentielle -> LC (delai revise)

Sur l'onglet "Commande client", `of_foxyz_N` porte le LC de la ligne N. Ce LC
est le suffixe de `date_livraison_prevue_<LC>` sur l'onglet Revue des exigences.

```js
(function(){
  const g=id=>{const e=document.getElementById(id);return e?(e.value||'').trim():'(absent)';};
  for(let n=1;n<=60;n++){
    if(!document.getElementById('reference_article_'+n)) continue;
    console.log('ligne '+n+'  of_foxyz_'+n+'='+g('of_foxyz_'+n)+'  date_cloture_prev_'+n+'='+g('date_cloture_prev_'+n));
  }
})();
```

Cote Revue des exigences, lister les delais revises :

```js
document.querySelectorAll('[id^="date_livraison_prevue_"]').forEach(el=>{
  console.log('suffixe='+el.id.replace('date_livraison_prevue_','')+'  val="'+(el.value||'')+'"');
});
```
