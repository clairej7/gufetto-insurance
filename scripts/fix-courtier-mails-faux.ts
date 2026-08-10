// Correction ponctuelle : écrase les mails courtier "clairement faux" (courtier
// connu à vrai domaine mais mail perso/autre) par le vrai mail de la base.
// Cliquet posé + event. Dry-run par défaut, --apply pour écrire.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getCourtierIndex, recipientSuspect, resolveCourtier } from "../src/lib/courtier-audit";
const APPLY = process.argv.includes("--apply");
async function main(){
  const idx = await getCourtierIndex();
  const ps = await prisma.insurancePipeline.findMany({ where:{ copro:{archivedAt:null} }, select:{ id:true, statut:true, coproId:true, copro:{select:{nom:true, courtierActuel:true, contactCourtierEmail:true}} } });
  const cible = ps.filter(p => (p.copro.contactCourtierEmail??"").trim() && recipientSuspect(p.copro.courtierActuel, p.copro.contactCourtierEmail, idx));
  console.log(`Dossiers à corriger = ${cible.length}\n`);
  let done=0, skip=0;
  for(const p of cible){
    const res = resolveCourtier(p.copro.courtierActuel, idx);
    const ref = res.kind==="courtier" ? res.ref : null;
    const nouveau = ref?.email ?? null;
    if(!nouveau || !ref){ skip++; console.log(`  ⏭️  ${p.copro.nom} : pas de mail de base → laissé (${p.copro.contactCourtierEmail})`); continue; }
    console.log(`  ✏️  [${p.statut}] ${p.copro.nom} : "${p.copro.contactCourtierEmail}" → ${nouveau} (${ref.nom})`);
    if(APPLY){
      await prisma.copro.update({ where:{ id:p.coproId }, data:{ contactCourtierEmail:nouveau, contratVerrouilleLe:new Date() } });
      await prisma.pipelineEvent.create({ data:{ pipelineId:p.id, type:"action_manuelle", description:`Mail courtier corrigé (perso/erroné → mail du courtier) : « ${p.copro.contactCourtierEmail} » → ${nouveau} (${ref.nom})`, metadata:{ auto:"courtier_mail_fix_faux", previous:p.copro.contactCourtierEmail, nouveau }, createdBy:"quentin.lepoutre@matera.eu" } });
      done++;
    }
  }
  console.log(`\n${APPLY?`✅ corrigés=${done} · laissés=${skip}`:"(dry-run — --apply pour corriger)"}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
