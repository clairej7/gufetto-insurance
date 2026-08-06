// ODR déjà envoyés par assureur, INGÉRÉS DEPUIS LES DOCS fournis par Quentin.
// Sert de référence au contrôle anti-doublon (avec, en plus, les dossiers déjà
// passés en « ODR envoyées / acceptées / en vigueur » côté base).
//
// Pour mettre à jour : ré-ingérer les docs d'un assureur et remplacer son tableau.
// Format : { adresse, numeroContrat }. L'adresse telle qu'écrite dans le doc ;
// le n° tel qu'écrit (les multi-n° "A / B" sont gérés par le matcher).
//
// AXA : 502 ODR, ingérés le 2026-08-06 depuis "LISTE ODR MATERA A JOUR (4)" onglet "ODR VALABLES".
// SADA : 123 ODR, ingérés le 2026-08-06 depuis "ODR SADA 2", "ODR Sada - 03_08_2026",
// "ODR Sada - 24_07_2026" (dédupliqués).

export type OdrSentRecord = { adresse: string; numeroContrat: string };

// Envois ODR HISTORIQUES (faits à la main avant l'app, depuis les docs PDF). Ajoutés
// à titre indicatif dans « Historique des envois ». count = nb d'ODR dans le doc ;
// montant = somme des primes des dossiers retrouvés dans Gufetto (partiel → indicatif).
export type OdrManualSend = { date: string; partner: "AXA" | "GENERALI" | "SADA" | "MILA"; count: number; montant: number };
export const ODR_MANUAL_SENDS: OdrManualSend[] = [
  { date: "2026-06-30", partner: "SADA", count: 93, montant: 629908 }, // ODR SADA LOLA
  { date: "2026-07-24", partner: "SADA", count: 4, montant: 4743 },
  { date: "2026-08-03", partner: "SADA", count: 25, montant: 83380 },
  { date: "2026-07-24", partner: "AXA", count: 7, montant: 43918 },
  { date: "2026-08-03", partner: "AXA", count: 7, montant: 21231 },
];

export const ODR_SENT_DOCS: Record<"AXA" | "GENERALI" | "SADA" | "MILA", OdrSentRecord[]> = {
  AXA: [
  {
    "adresse": "65 AVENUE CARNOT 91100 CORBEIL ESSONNES",
    "numeroContrat": "38857504"
  },
  {
    "adresse": "91 BIS RUE DU MONT CENIS 75018 PARIS",
    "numeroContrat": "289924704"
  },
  {
    "adresse": "50 52 54 AV DU GENERAL DE GAULLE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "690381604"
  },
  {
    "adresse": "818 RUE D ARBERE IMM LONGCHAMP A ET B 01220 DIVONNE LES BAINS",
    "numeroContrat": "841855104"
  },
  {
    "adresse": "2 4 6 8 RUE A BENAMOU 92270 BOIS COLOMBES",
    "numeroContrat": "1264620605"
  },
  {
    "adresse": "8 RUE DE CHATEAUDUN 92250 LA GARENNE COLOMBES",
    "numeroContrat": "1426240604"
  },
  {
    "adresse": "91 RUE RAYMOND RIDEL 92250 LA GARENNE COLOMBES",
    "numeroContrat": "1428745404"
  },
  {
    "adresse": "22 24 A RUE D ALSACE LORRAINE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "1661695204"
  },
  {
    "adresse": "23 RUE JEANNE GLEUZER 92700 COLOMBES",
    "numeroContrat": "1705625704"
  },
  {
    "adresse": "38 RUE FRANCOIS 1ER 92700 COLOMBES",
    "numeroContrat": "1705631304"
  },
  {
    "adresse": "6 RUE VICTOR HUGO 92270 BOIS COLOMBES",
    "numeroContrat": "1726984204"
  },
  {
    "adresse": "25 RUE DES VALLEES 92700 COLOMBES",
    "numeroContrat": "1761098804"
  },
  {
    "adresse": "4 6 RUE AMBROISE PARE 92700 COLOMBES",
    "numeroContrat": "1761135104"
  },
  {
    "adresse": "75 RUE DE PARIS 92110 CLICHY",
    "numeroContrat": "1856973204"
  },
  {
    "adresse": "20B RUE BUISSON 92250 LA GARENNE COLOMBES",
    "numeroContrat": "1856989804"
  },
  {
    "adresse": "63 AV FAIDHERBE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "1879021404"
  },
  {
    "adresse": "43 RUE ALEXIS BOUVIER ET 23 BD DE FINLANDE 92700 COLOMBES",
    "numeroContrat": "1903987704"
  },
  {
    "adresse": "7 9 RUE PIERRE BADUEL 92700 COLOMBES",
    "numeroContrat": "1911686804"
  },
  {
    "adresse": "337 RUE D'ESTIENNE D'ORVES 92700 COLOMBES",
    "numeroContrat": "1954002904"
  },
  {
    "adresse": "76 RUE DU GENERAL LECLERC 92270 BOIS COLOMBES",
    "numeroContrat": "1975106604"
  },
  {
    "adresse": "31 RUE DE LA GAITE 92700 COLOMBES",
    "numeroContrat": "1975108404"
  },
  {
    "adresse": "7 RUE CLARA LEMOINE 92700 COLOMBES",
    "numeroContrat": "1991108104"
  },
  {
    "adresse": "28 RUE DU MARECHAL JOFFRE 92700 COLOMBES",
    "numeroContrat": "1993122904"
  },
  {
    "adresse": "51 53 RUE DU MARECHAL JOFFRE 92700 COLOMBES",
    "numeroContrat": "1993189104"
  },
  {
    "adresse": "134 RUE DES BOURGUIGNONS 92600 ASNIERES SUR SEINE",
    "numeroContrat": "2025562204"
  },
  {
    "adresse": "56 RUE DU PROGRES 92700 COLOMBES",
    "numeroContrat": "2042394104"
  },
  {
    "adresse": "82 84 AV ANATOLE FRANCE 92700 COLOMBES",
    "numeroContrat": "2045919904"
  },
  {
    "adresse": "2 RUE MARC BACHET 92700 COLOMBES",
    "numeroContrat": "2068648104"
  },
  {
    "adresse": "77 BD MARCEAU 92700 COLOMBES",
    "numeroContrat": "2072724804"
  },
  {
    "adresse": "52 54 RUE MAURICE BERTEAUX 92700 COLOMBES",
    "numeroContrat": "2072752004"
  },
  {
    "adresse": "2 RUE DU BOURNARD 92700 COLOMBES",
    "numeroContrat": "2072784704"
  },
  {
    "adresse": "43 RUE FELIX FAURE 92700 COLOMBES",
    "numeroContrat": "2081437704"
  },
  {
    "adresse": "1 RUE SARTORIS 92250 LA GARENNE COLOMBES",
    "numeroContrat": "2127647704"
  },
  {
    "adresse": "19 RUE DE LA FRATERNITE 92700 COLOMBES",
    "numeroContrat": "2146441404"
  },
  {
    "adresse": "1 RUE DESMONT DUPONT 92700 COLOMBES",
    "numeroContrat": "2166341204"
  },
  {
    "adresse": "1 ET 3 RUE GUSTAVE CAILLEBOTTE 95100 ARGENTEUIL",
    "numeroContrat": "2188950904"
  },
  {
    "adresse": "3BIS RUE DES ALOUETTES 92700 COLOMBES",
    "numeroContrat": "2214074104"
  },
  {
    "adresse": "10B RUE JEAN BONNAL 92250 LA GARENNE COLOMBES",
    "numeroContrat": "2331189204"
  },
  {
    "adresse": "16 AVENUE VICTOR HUGO 92140 CLAMART",
    "numeroContrat": "2334860504"
  },
  {
    "adresse": "10 12 AV DU MARECHAL FOCH 92700 COLOMBES",
    "numeroContrat": "2335052604"
  },
  {
    "adresse": "34 RUE GABRIEL PERI 92700 COLOMBES",
    "numeroContrat": "2354781204"
  },
  {
    "adresse": "201 AV D ARGENTEUIL 92270 BOIS COLOMBES",
    "numeroContrat": "2409069804"
  },
  {
    "adresse": "146 148 RUE EDOUARD VAILLANT 92700 COLOMBES",
    "numeroContrat": "2495546804"
  },
  {
    "adresse": "207 RUE DES VOIES DU BOIS 92700 COLOMBES",
    "numeroContrat": "2521122204"
  },
  {
    "adresse": "7 PLACE DE LA REPUBLIQUE 92270 BOIS COLOMBES",
    "numeroContrat": "2611508404"
  },
  {
    "adresse": "7 BD DES DEUX COMMUNES 94120 FONTENAY SOUS BOIS",
    "numeroContrat": "2716958004"
  },
  {
    "adresse": "46 48 BD MARCEAU 92700 COLOMBES",
    "numeroContrat": "2771372704"
  },
  {
    "adresse": "98 AV DE VERDUN ET 2 4 RUE JEAN BRUNET 92270 BOIS COLOMBES",
    "numeroContrat": "2838898604"
  },
  {
    "adresse": "5 7 RUE VICTOR HUGO 92700 COLOMBES",
    "numeroContrat": "3025077804"
  },
  {
    "adresse": "11 RUE DU COMMERCE 92700 COLOMBES",
    "numeroContrat": "3027690604"
  },
  {
    "adresse": "70 72 AV HENRI BARBUSSE ET 2 RUE DE PRAGUE 92700 COLOMBES",
    "numeroContrat": "3132199604"
  },
  {
    "adresse": "11 RUE D ALSACE LORRAINE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "3159663304"
  },
  {
    "adresse": "28 RUE DES PEUPLIERS 92270 BOIS COLOMBES",
    "numeroContrat": "3165097104"
  },
  {
    "adresse": "30 RUE DE BRETAGNE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "3183175104"
  },
  {
    "adresse": "2 RUE DE MARSEILLE 75010 PARIS",
    "numeroContrat": "3205306504"
  },
  {
    "adresse": "60 RUE MEDERIC 92250 LA GARENNE COLOMBES",
    "numeroContrat": "3256144404"
  },
  {
    "adresse": "99 RUE ALEXANDRE DUMAS 75020 PARIS",
    "numeroContrat": "3339284304"
  },
  {
    "adresse": "70 AV DU MOULIN DE SAQUET ET 11 RUE MONSIGNY 94400 VITRY SUR SEINE",
    "numeroContrat": "3340727204"
  },
  {
    "adresse": "613 ET 619 CHEMIN DE CHANTEMERLE 73000 CHAMBERY",
    "numeroContrat": "3433524104"
  },
  {
    "adresse": "129 RUE ARISTIDE BRIAND 92300 LEVALLOIS PERRET",
    "numeroContrat": "3485435904"
  },
  {
    "adresse": "167 BD VOLTAIRE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "3621898804"
  },
  {
    "adresse": "20B RUE SAINT HILAIRE 92700 COLOMBES",
    "numeroContrat": "3824578204"
  },
  {
    "adresse": "90 ROUTE DE MONTESSON 78110 LE VESINET",
    "numeroContrat": "3880469204"
  },
  {
    "adresse": "6 PASSAGE CHAMPIONNET 75018 PARIS",
    "numeroContrat": "3906011804"
  },
  {
    "adresse": "42 RUE GABRIEL PERI 92700 COLOMBES",
    "numeroContrat": "3910950404"
  },
  {
    "adresse": "22 RUE DES RECULETTES ET 45/47 RUE CROULEBARBE 75013 PARIS",
    "numeroContrat": "4019025904"
  },
  {
    "adresse": "5 PLACE DES VICTOIRES 92600 ASNIERES SUR SEINE",
    "numeroContrat": "4046381204"
  },
  {
    "adresse": "37 AV DE L EUROPE 92700 COLOMBES",
    "numeroContrat": "4052560304"
  },
  {
    "adresse": "17 RUE DE RAMBOUILLET 75012 PARIS",
    "numeroContrat": "4066052104"
  },
  {
    "adresse": "46 RUE SAINT DENIS 75001 PARIS",
    "numeroContrat": "4127382104"
  },
  {
    "adresse": "26 RUE ST DENIS 92700 COLOMBES",
    "numeroContrat": "4215619804"
  },
  {
    "adresse": "13 RUE CAMBON 92250 LA GARENNE COLOMBES",
    "numeroContrat": "4226698704"
  },
  {
    "adresse": "88 90 BD DE VALMY 92700 COLOMBES",
    "numeroContrat": "4331358004"
  },
  {
    "adresse": "15 A 19T RUE DES CERISIER 92700 COLOMBES",
    "numeroContrat": "4351972804"
  },
  {
    "adresse": "114 RUE DES MONTS CLAIRS 92700 COLOMBES",
    "numeroContrat": "4355750104"
  },
  {
    "adresse": "64 RUE BENJAMIN DELESSERT 93500 PANTIN",
    "numeroContrat": "4434982904"
  },
  {
    "adresse": "24 RUE DU PDT SALVADOR ALLENDE 92700 COLOMBES",
    "numeroContrat": "4590138204"
  },
  {
    "adresse": "92 BD DE VERDUN 94120 FONTENAY SOUS BOIS",
    "numeroContrat": "4835660404"
  },
  {
    "adresse": "15 17 19 20 21 23 24 RUE DES ROSES ET 74 76 78 RUE DE LA VICTOIREU 95100 ARGENTEUIL",
    "numeroContrat": "5079466304"
  },
  {
    "adresse": "102 BD DE LA REPUBLIQUE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "5094830904"
  },
  {
    "adresse": "7 RUE ALEXIS BOUVIER 92700 COLOMBES",
    "numeroContrat": "5189274604"
  },
  {
    "adresse": "38 R DE L ABBE JEAN GLATZ 92270 BOIS COLOMBES",
    "numeroContrat": "5195432504"
  },
  {
    "adresse": "6 RUE BERNE 93200 ST DENIS",
    "numeroContrat": "5326318604"
  },
  {
    "adresse": "41 BD VALMY ET 1 AV LOUISE DE BETTIGNIES 92700 COLOMBES",
    "numeroContrat": "5329045604"
  },
  {
    "adresse": "23 RUE PRUDENT NEEL 92500 RUEIL MALMAISON",
    "numeroContrat": "5414124304"
  },
  {
    "adresse": "12 RUE PAPILLON 75009 PARIS",
    "numeroContrat": "5597645104"
  },
  {
    "adresse": "6 RUE PAUL VAILLANT COUTURIER 92230 GENNEVILLIERS",
    "numeroContrat": "5799222204"
  },
  {
    "adresse": "163 165 RUE DE BAGNOLET 75020 PARIS",
    "numeroContrat": "5821076804"
  },
  {
    "adresse": "131B RUE GAL LECLERC 92270 BOIS COLOMBES",
    "numeroContrat": "5932549804"
  },
  {
    "adresse": "74 BD HENRI BARBUSSE 78800 HOUILLES",
    "numeroContrat": "5974220004"
  },
  {
    "adresse": "22 RUE JEAN MARIDOR 75015 PARIS",
    "numeroContrat": "6010240104"
  },
  {
    "adresse": "23 RUE PIERRE JOIGNEAUX 92600 ASNIERES SUR SEINE",
    "numeroContrat": "6027059604"
  },
  {
    "adresse": "62 114 IMPASSE DU RUISSEAU 01170 GEX",
    "numeroContrat": "6243296004"
  },
  {
    "adresse": "66 RUE DU MARECHAL JOFFRE 92700 COLOMBES",
    "numeroContrat": "6419600804"
  },
  {
    "adresse": "5 AVENUE DE MADRID 92200 NEUILLY SUR SEINE",
    "numeroContrat": "6433612104"
  },
  {
    "adresse": "8 VILLA AUBERT 92600 ASNIERES SUR SEINE",
    "numeroContrat": "6493746304"
  },
  {
    "adresse": "27 BD MAGENTA 75010 PARIS",
    "numeroContrat": "6538434004"
  },
  {
    "adresse": "24 RUE DE L ORME ET 49 RUE ST DENIS 92700 COLOMBES",
    "numeroContrat": "6606355904"
  },
  {
    "adresse": "51 BD DE STRASBOURG 75010 PARIS",
    "numeroContrat": "6616962804"
  },
  {
    "adresse": "32 RUE FELIX FAURE 92700 COLOMBES",
    "numeroContrat": "6630670704"
  },
  {
    "adresse": "112 AVENUE HENRI BARBUSSE 92140 CLAMART",
    "numeroContrat": "6636735104"
  },
  {
    "adresse": "54BIS RUE DU CHATEAU 92250 LA GARENNE COLOMBES",
    "numeroContrat": "6654810904"
  },
  {
    "adresse": "9 RUE DES ALOUETTES 92700 COLOMBES",
    "numeroContrat": "6706321904"
  },
  {
    "adresse": "80 BD DE VALMY 92700 COLOMBES",
    "numeroContrat": "6723018904"
  },
  {
    "adresse": "3 RUE PIERRE DURAND 92600 ASNIERES SUR SEINE",
    "numeroContrat": "6821913604"
  },
  {
    "adresse": "21 RUE JEAN JAURES 92600 ASNIERES SUR SEINE",
    "numeroContrat": "6945617904"
  },
  {
    "adresse": "14 AV FRANCOIS BERNIER 92700 COLOMBES",
    "numeroContrat": "6949695604"
  },
  {
    "adresse": "13 RUE VAUCANSON 93500 PANTIN",
    "numeroContrat": "6951747604"
  },
  {
    "adresse": "2 BD DES OISEAUX 92700 COLOMBES",
    "numeroContrat": "6985270604"
  },
  {
    "adresse": "250 ROUTE DU MARAIS 74800 CORNIER",
    "numeroContrat": "6990298104"
  },
  {
    "adresse": "576C CHEMIN DES TREPETS 74140 VEIGY FONCENEX",
    "numeroContrat": "7035353004"
  },
  {
    "adresse": "52 RUE BUZENVAL 75020 PARIS",
    "numeroContrat": "7205470604"
  },
  {
    "adresse": "11 13 RUE DE BELZUNCE 75010 PARIS",
    "numeroContrat": "7296881704"
  },
  {
    "adresse": "24 RUE BOURDARIE LEFURE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "7335107804"
  },
  {
    "adresse": "38 RUE JACQUES LOUIS BERNIER 92700 COLOMBES",
    "numeroContrat": "7335395504"
  },
  {
    "adresse": "10 RUE DE SOLFERINO 92700 COLOMBES",
    "numeroContrat": "7335395804"
  },
  {
    "adresse": "31 BD DE LA REPUBLIQUE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "7336546704"
  },
  {
    "adresse": "7 RUE AMPERE 92700 COLOMBES",
    "numeroContrat": "7337391304"
  },
  {
    "adresse": "76 AV DE L AGENT SARRE 92700 COLOMBES",
    "numeroContrat": "7337437104"
  },
  {
    "adresse": "375 AV DE LA REPUBLIQUE 92000 NANTERRE",
    "numeroContrat": "7341092104"
  },
  {
    "adresse": "34 RUE PIERRE GEOFROIX 92700 COLOMBES",
    "numeroContrat": "7352202704"
  },
  {
    "adresse": "24 RUE DE COLOMBES 92400 COURBEVOIE",
    "numeroContrat": "7354733104"
  },
  {
    "adresse": "53 BD CLEMENCEAU 92400 COURBEVOIE",
    "numeroContrat": "7400820404"
  },
  {
    "adresse": "30 32 AV DE L AGENT SARRE 92700 COLOMBES",
    "numeroContrat": "7437470304"
  },
  {
    "adresse": "11 RUE GUILLAUME FAREL 92400 COURBEVOIE",
    "numeroContrat": "7437504104"
  },
  {
    "adresse": "13 23 RUE DE PARIS 93800 EPINAY SUR SEINE",
    "numeroContrat": "7437556304"
  },
  {
    "adresse": "54 58 PIERRE TIMBAUD 92230 GENNEVILLIERS",
    "numeroContrat": "7447431704"
  },
  {
    "adresse": "30 RUE CHARCOT 92270 BOIS COLOMBES",
    "numeroContrat": "7447732904"
  },
  {
    "adresse": "5 AVENUE DU CORPS EXPEDITIONNAIRE FRANCAIS 13010 MARSEILLE",
    "numeroContrat": "7471034504"
  },
  {
    "adresse": "79 RUE DES SAZIERES ET 39 45 AV DE STALINGRAD 92700 COLOMBES",
    "numeroContrat": "7503007604"
  },
  {
    "adresse": "132 RUE MOSLARD 92700 COLOMBES",
    "numeroContrat": "7578818704"
  },
  {
    "adresse": "19 RUE ARMAND SILVESTRE 92400 COURBEVOIE",
    "numeroContrat": "7653913804"
  },
  {
    "adresse": "82 84 RUE MOSLARD 92700 COLOMBES",
    "numeroContrat": "10069784704"
  },
  {
    "adresse": "31 RUE PAUL BOVIER LAPIERRE 69530 BRIGNAIS",
    "numeroContrat": "10070082304"
  },
  {
    "adresse": "2 RUE JEAN BONAL ET 78 AV DU GENERAL DE GAULLE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "10086423704"
  },
  {
    "adresse": "5 AV AUBENNE 92700 COLOMBES",
    "numeroContrat": "10090607204"
  },
  {
    "adresse": "DOMAINE LES HAUTS DE BELLEPEIRE 43 IMPASSE DES GOELETTES 13170 LES PENNES MIRABEAU",
    "numeroContrat": "10107606504"
  },
  {
    "adresse": "36 RUE KLEBER 92300 LEVALLOIS PERRET",
    "numeroContrat": "10113304304"
  },
  {
    "adresse": "5 AVENUE DE VALBERG 06470 PEONE",
    "numeroContrat": "10121552804"
  },
  {
    "adresse": "30 34 RUE DE NANTERRE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "10139473804"
  },
  {
    "adresse": "67 AVENUE DR ARNOLD NETTER 75012 PARIS",
    "numeroContrat": "10142792004"
  },
  {
    "adresse": "160 RUE JB CHARCOT 92400 COURBEVOIE",
    "numeroContrat": "10143847104"
  },
  {
    "adresse": "43 R DE L ALMA 92400 COURBEVOIE",
    "numeroContrat": "10194473004"
  },
  {
    "adresse": "11 RUE DU CAPITAINE GUYNE ET 26 28 AV DE L'EUROPE 92270 BOIS COLOMBES",
    "numeroContrat": "10237465604"
  },
  {
    "adresse": "8 RUE GUENOT 75011 PARIS",
    "numeroContrat": "10305186304"
  },
  {
    "adresse": "2 AV MENELOTTE 92700 COLOMBES",
    "numeroContrat": "10396949304"
  },
  {
    "adresse": "9 15 RUE SAINTE MARIE 92400 COURBEVOIE",
    "numeroContrat": "10400933904"
  },
  {
    "adresse": "5 RUE DU PRINTEMPS 75017 PARIS",
    "numeroContrat": "10411289004"
  },
  {
    "adresse": "RUE D ESTIENNES D ORVES ET BD CHARLES DE GAULLE 92700 COLOMBES",
    "numeroContrat": "10447481504"
  },
  {
    "adresse": "81 BOULEVARD MARCEL PAUL 44800 ST HERBLAIN",
    "numeroContrat": "10486256104"
  },
  {
    "adresse": "13B RUE DE L ABREUVOIR ET 146 RUE DE PARADIS 92400 COURBEVOIE",
    "numeroContrat": "10493010304"
  },
  {
    "adresse": "71/79 RUE DE STRASBOURG 92400 COURBEVOIE",
    "numeroContrat": "10581393204"
  },
  {
    "adresse": "12 18 RUE DE LA SOLIDARITE 94400 VITRY SUR SEINE",
    "numeroContrat": "10595867904"
  },
  {
    "adresse": "22 RUE DE COLMAR 94170 LE PERREUX SUR MARNE",
    "numeroContrat": "10600159104"
  },
  {
    "adresse": "44 RUE POPINCOURT 75011 PARIS",
    "numeroContrat": "10625624804"
  },
  {
    "adresse": "34/36 RUE DES BOURGUIGNONS 92600 ASNIèRES-SUR-SEINE",
    "numeroContrat": "10633685904"
  },
  {
    "adresse": "4/6 RUE EUGENE BESANCON 92270 BOIS COLOMBES",
    "numeroContrat": "10638534204"
  },
  {
    "adresse": "2 TER CHEMIN DE LA VIA DESSOUS 73100 MOUXY",
    "numeroContrat": "10641895504"
  },
  {
    "adresse": "78 RUE DE CLERY 75002 PARIS",
    "numeroContrat": "10648739304"
  },
  {
    "adresse": "5 CITE DE PHALSBOURG 75011 PARIS",
    "numeroContrat": "10716766004"
  },
  {
    "adresse": "34 36 RUE WESTERMEYER ET 86 88 RUE MOLIERE 94200 IVRY SUR SEINE",
    "numeroContrat": "10757420404"
  },
  {
    "adresse": "92 BD GABRIEL PERI 92240 MALAKOFF",
    "numeroContrat": "10837417704"
  },
  {
    "adresse": "9 PLACE DES CERISIERS 95160 MONTMORENCY",
    "numeroContrat": "10854661904"
  },
  {
    "adresse": "10 RUE RENE JACQUES 92130 ISSY LES MOULINEAUX",
    "numeroContrat": "10862170404"
  },
  {
    "adresse": "5 RUE LUCIE 94600 CHOISY LE ROI",
    "numeroContrat": "10867452704"
  },
  {
    "adresse": "591 AVENUE DU COLONEL PICOT 83000 TOULON",
    "numeroContrat": "10883606704"
  },
  {
    "adresse": "60 QUAI DES ORFEVRES 75001 PARIS",
    "numeroContrat": "10926746604"
  },
  {
    "adresse": "24 A RUE MURILLO 75008 PARIS",
    "numeroContrat": "10926746604"
  },
  {
    "adresse": "40 42 RUE PAUL BERT 92150 SURESNES",
    "numeroContrat": "10929569704"
  },
  {
    "adresse": "91 RUE DES BOURGUIGNONS 92270 BOIS COLOMBES",
    "numeroContrat": "11016585104"
  },
  {
    "adresse": "268 AV CHABADENIA 64210 BIDART",
    "numeroContrat": "11241100604"
  },
  {
    "adresse": "7 GRANDE RUE 95640 LE HEAULME",
    "numeroContrat": "20153505404"
  },
  {
    "adresse": "17 RUE DU LAOS 75015 PARIS",
    "numeroContrat": "20696297904"
  },
  {
    "adresse": "1/5 AVENUE GONZALVE 94420 LE PLESSIS TREVISE",
    "numeroContrat": "20744486904"
  },
  {
    "adresse": "1 3 5 7 BD DE LA PLAINE 77600 CHANTELOUP EN BRIE",
    "numeroContrat": "20749410904"
  },
  {
    "adresse": "7 RUE DES JOCKOS 92330 SCEAUX",
    "numeroContrat": "20751423704"
  },
  {
    "adresse": "118-124 AVENUE ROGER SALENGRO ET 1-1BIS RUE JULES VERNE 92290 CHATENAY-MALABRY",
    "numeroContrat": "20766302004"
  },
  {
    "adresse": "33-37 RUE PAUL BOURGET 95120 ERMONT",
    "numeroContrat": "20824827304"
  },
  {
    "adresse": "1 RUE LOUIS XAVIER DE RICARD 94120 FONTENAY SOUS BOIS",
    "numeroContrat": "20852151204"
  },
  {
    "adresse": "5 RUE RASPAIL 92270 BOIS COLOMBES",
    "numeroContrat": "20867530704"
  },
  {
    "adresse": "5 RUE JULIETTE LAMBER 75017 PARIS",
    "numeroContrat": "20873913604"
  },
  {
    "adresse": "78 80 RUE SAINT DENIS 92700 COLOMBES",
    "numeroContrat": "20904771004"
  },
  {
    "adresse": "27 29 RUE FELIX FAURE 92700 COLOMBES",
    "numeroContrat": "20954900804"
  },
  {
    "adresse": "16 - 18 AVENUE MARC HAMET 51470 SAINT MEMMIE",
    "numeroContrat": "20961581204"
  },
  {
    "adresse": "33 AVENUE DE L AGENT SARRE 92700 COLOMBES",
    "numeroContrat": "21106571304"
  },
  {
    "adresse": "1 RUE MAURICE RAVEL 93120 LA COURNEUVE",
    "numeroContrat": "21107396104"
  },
  {
    "adresse": "66 RUE SARTORIS 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21111046104"
  },
  {
    "adresse": "1-5 AVENUE DE L ASSOCIATION 92700 COLOMBES",
    "numeroContrat": "21125688004"
  },
  {
    "adresse": "32 RUE DU GENERAL FERRIE 92700 COLOMBES",
    "numeroContrat": "21125899904"
  },
  {
    "adresse": "21 RUE PAUL WEISS 67240 BISCHWILLER",
    "numeroContrat": "21128033304"
  },
  {
    "adresse": "70 RUE D'ESTIENNE D'ORVES PARKING 92700 COLOMBES",
    "numeroContrat": "21153323004"
  },
  {
    "adresse": "21 A 67 RUE SAINT NICOLAS 49100 ANGERS",
    "numeroContrat": "21165162704"
  },
  {
    "adresse": "129-131 RUE VIEUX PONT DE SEVRES 92100 BOULOGNE BILLANCOURT",
    "numeroContrat": "21172933704"
  },
  {
    "adresse": "132 RUE DE LA REPUBLIQUE 92150 SURESNES",
    "numeroContrat": "21178524704"
  },
  {
    "adresse": "27 BIS RUE SARTORIS 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21192330504"
  },
  {
    "adresse": "44 46 RUE DU PDT SALVADOR 92700 COLOMBES",
    "numeroContrat": "21201459904"
  },
  {
    "adresse": "12 ROUTE DE GISY 91570 BIEVRES",
    "numeroContrat": "21212767004"
  },
  {
    "adresse": "2 A 6 RUE DE PROVENCE 93700 DRANCY",
    "numeroContrat": "21243137404"
  },
  {
    "adresse": "20 RUE DE LA VERRERIE 75004 PARIS",
    "numeroContrat": "21267470804"
  },
  {
    "adresse": "177 BIS RUE GABRIEL PERI 94400 VITRY SUR SEINE",
    "numeroContrat": "21304137804"
  },
  {
    "adresse": "175 RUE AIME CESAIRE 01630 ST GENIS POUILLY",
    "numeroContrat": "21314886204"
  },
  {
    "adresse": "45 RUE DE LA PROCESSION 75015 PARIS",
    "numeroContrat": "21340698704"
  },
  {
    "adresse": "44 RUE SORBIER 75020 PARIS",
    "numeroContrat": "21345707604"
  },
  {
    "adresse": "4/6/8 PLACE JACQUES MADAULE ET 3 RUE LARTIGUE 92130 ISSY LES MOULINEAUX",
    "numeroContrat": "21349702404"
  },
  {
    "adresse": "48 RUE VICTOR HUGO 92700 COLOMBES",
    "numeroContrat": "21385765704"
  },
  {
    "adresse": "15 RUE DU COMMERCE ET 29 RUE DE LA PAIX 92700 COLOMBES",
    "numeroContrat": "21386148704"
  },
  {
    "adresse": "68 RUE DU LAVOIR 93370 MONTFERMEIL",
    "numeroContrat": "21444992304"
  },
  {
    "adresse": "1/3/5 MAIL JEAN ZAY 93210 SAINT DENIS",
    "numeroContrat": "21450280504"
  },
  {
    "adresse": "238 RUE PELLEPORT 33800 BORDEAUX",
    "numeroContrat": "21475017004"
  },
  {
    "adresse": "80B/84 RUE SARTORIS 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21481627604"
  },
  {
    "adresse": "22 ALLEES LEON GAMBETTA 92110 CLICHY",
    "numeroContrat": "21484887304"
  },
  {
    "adresse": "1 AVENUE LAPY 92700 COLOMBES",
    "numeroContrat": "21499579904"
  },
  {
    "adresse": "23 RUE PASTEUR 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21500369504"
  },
  {
    "adresse": "25 BOULEVARD DE GRENELLE 75015 PARIS",
    "numeroContrat": "21500382104"
  },
  {
    "adresse": "2 RUE DIDEROT 92600 ASNIERES SUR SEINE",
    "numeroContrat": "21534959104"
  },
  {
    "adresse": "45/53 BD GALLIENI 95100 ARGENTEUIL",
    "numeroContrat": "21541894804"
  },
  {
    "adresse": "47 RUE CONDORCET 75009 PARIS",
    "numeroContrat": "21556639304"
  },
  {
    "adresse": "74 BIS RUE DE L AIGLE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21591119404"
  },
  {
    "adresse": "80 RUE SARTORIS ET 65 A 71 BD DE LA REPUBLIQUE 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21627134404"
  },
  {
    "adresse": "15 RUE DE LA REPUBLIQUE 83470 ST MAXIMIN LA STE BA",
    "numeroContrat": "21628195704"
  },
  {
    "adresse": "18 RUE DU CHATEAU 92250 LA GARENNE COLOMBES",
    "numeroContrat": "21645545804"
  },
  {
    "adresse": "53 RUE DES GUILLAUMES 93130 NOISY LE SEC",
    "numeroContrat": "21660442804"
  },
  {
    "adresse": "15/15B RUE CLARA LEMOINE 92700 COLOMBES",
    "numeroContrat": "21692647304"
  },
  {
    "adresse": "60 RUE JULES FERRY 94120 FONTENAY SOUS BOIS",
    "numeroContrat": "21730567304"
  },
  {
    "adresse": "93 RUE DU RUISSEAU 75018 PARIS",
    "numeroContrat": "21733472504"
  },
  {
    "adresse": "242 BOULEVARD THEOPHILE SUEUR ET 8 RUE DES GRANDS PECHERS 93100 MONTREUIL",
    "numeroContrat": "21733755704"
  },
  {
    "adresse": "26B RUE DE LA BELLE ÎLE 77500 CHELLES",
    "numeroContrat": "21742220004"
  },
  {
    "adresse": "8 RUE EUGENE BESANCON 92270 BOIS COLOMBES",
    "numeroContrat": "21762104004"
  },
  {
    "adresse": "1- 3 RUE DE LA COUR DES NOUES ET 7*9 RUE DE L'INDRE 75020 PARIS",
    "numeroContrat": "21773671204"
  },
  {
    "adresse": "13 AVENUE WINDSOR 06400 CANNES",
    "numeroContrat": "21774274904"
  },
  {
    "adresse": "20-22 RUE PAUL DE KOCK 93230 ROMAINVILLE",
    "numeroContrat": "21807085004"
  },
  {
    "adresse": "45 RUE DOMBASLE ET 10 RUE DES MARTYRS 93130 NOISY LE SEC",
    "numeroContrat": "21879242704"
  },
  {
    "adresse": "6 8 RUE NEUVE 94400 VITRY SUR SEINE",
    "numeroContrat": "21884269004"
  },
  {
    "adresse": "186/188 BD GABRIEL PERI 93110 ROSNY SOUS BOIS",
    "numeroContrat": "21952259804"
  },
  {
    "adresse": "2 AVENUE DU GENERAL DE GAULLE 27620 GASNY",
    "numeroContrat": "21986821504"
  },
  {
    "adresse": "22 AVENUE CHEVREUL 92600 ASNIERES SUR SEINE",
    "numeroContrat": "22040763104"
  },
  {
    "adresse": "5 RUE HOCHE 92700 COLOMBES",
    "numeroContrat": "22040764404"
  },
  {
    "adresse": "53 BOULEVARD DE PESARO 92000 NANTERRE",
    "numeroContrat": "22113995704"
  },
  {
    "adresse": "62 64 RUE DE LA ROQUETTE 75011 PARIS",
    "numeroContrat": "22114230604"
  },
  {
    "adresse": "134 BOULEVARD HENRI BARBUSSE 78800 HOUILLES",
    "numeroContrat": "22114749504"
  },
  {
    "adresse": "166 168 AVENUE DU GENERAL LECLERC 93500 PANTIN",
    "numeroContrat": "22170525204"
  },
  {
    "adresse": "17 RUE PROUDHON 93210 ST DENIS",
    "numeroContrat": "22196287504"
  },
  {
    "adresse": "70 RUE GERMAINE TILLION 92700 COLOMBES",
    "numeroContrat": "22197228504"
  },
  {
    "adresse": "53 BOULEVARD DE PESARO 92000 NANTERRE",
    "numeroContrat": "22197533404"
  },
  {
    "adresse": "129 RUE DU GENERAL LECLERC 93110 ROSNY SOUS BOIS",
    "numeroContrat": "22202244604"
  },
  {
    "adresse": "57 RUE THEODORE HONORE 94130 NOGENT SUR MARNE",
    "numeroContrat": "22202475804"
  },
  {
    "adresse": "46 RUE DE L ARBRE SEC 75001 PARIS",
    "numeroContrat": "22211623104"
  },
  {
    "adresse": "10 VILLA DANRE 93200 ST DENIS",
    "numeroContrat": "22234437704"
  },
  {
    "adresse": "101 RUE ANDRE KARMAN 93300 AUBERVILLIERS",
    "numeroContrat": "22244172204"
  },
  {
    "adresse": "9 AVENUE VOLTAIRE ET 47 AVENUE KELLERMAN 95230 SOISY SOUS MONTMOREN",
    "numeroContrat": "588939850000"
  },
  {
    "adresse": "1 AV AUDRA 92700 COLOMBES",
    "numeroContrat": "636305750000"
  },
  {
    "adresse": "56 RUE CASTAGNARY ET 2 VILLA DES CHARMILLES 75015 PARIS",
    "numeroContrat": "20000424936887"
  },
  {
    "adresse": "4 RUE JOUYE ROUVE 75020 PARIS",
    "numeroContrat": "20000773265387"
  },
  {
    "adresse": "34 RUE POUSSIN 75016 PARIS",
    "numeroContrat": "20513065366487"
  },
  {
    "adresse": "59 AVENUE DE LA GRANDE CHAMPAGNE 01220 DIVONNE LES BAINS",
    "numeroContrat": "30178900126187"
  },
  {
    "adresse": "26 RUE DU PROGRES 13005 MARSEILLE",
    "numeroContrat": "31386041502487"
  },
  {
    "adresse": "9 RUE PUITS DE TET 21160 MARSANNAY LA COTE",
    "numeroContrat": "32187040000787"
  },
  {
    "adresse": "138 RUE DE CHATOU 92700 COLOMBES",
    "numeroContrat": "37577040749687"
  },
  {
    "adresse": "9 RUE PAUL BERT 92240 MALAKOFF",
    "numeroContrat": "39488041300587"
  },
  {
    "adresse": "36 RUE DESIRE PREAUX 93100 MONTREUIL",
    "numeroContrat": "39494042073787"
  },
  {
    "adresse": "18 RUE DE L AGRICULTURE 92700 COLOMBES",
    "numeroContrat": "39573001064387"
  },
  {
    "adresse": "13 RUE FAUVET 75018 PARIS",
    "numeroContrat": "10048900804"
  },
  {
    "adresse": "10/18 RUE MEHUL 93500 PANTIN",
    "numeroContrat": "10111316704"
  },
  {
    "adresse": "3 AV ANATOLE FRANCE 94600 CHOISY LE ROI",
    "numeroContrat": "10313574804"
  },
  {
    "adresse": "10 RUE QUINCAMPOIX 75004 PARIS",
    "numeroContrat": "10524786504"
  },
  {
    "adresse": "27 RUE SAINT ROCH 75001 PARIS",
    "numeroContrat": "10546365504"
  },
  {
    "adresse": "132 RUE LECOURBE 75015 PARIS",
    "numeroContrat": "10611904704"
  },
  {
    "adresse": "193 BD VOLTAIRE 75011 PARIS",
    "numeroContrat": "10926746604"
  },
  {
    "adresse": "208 AVENUE ARISTIDE BRIAND 92220 BAGNEUX",
    "numeroContrat": "21039599504"
  },
  {
    "adresse": "30 RUE DE LA REPUBLIQUE 95650 BOISSY L AILLERIE",
    "numeroContrat": "21217714704"
  },
  {
    "adresse": "73/75/77 AV FRANCOIS MITTERRAND 94000 CRETEIL",
    "numeroContrat": "21403442104"
  },
  {
    "adresse": "7-9, RUE JEAN CHARCOT / 22-24 RUE C. DORDAIN 93600 AULNAY SOUS BOIS",
    "numeroContrat": "21441124204"
  },
  {
    "adresse": "177/179 AV DE CLICHY 75017 PARIS",
    "numeroContrat": "21500395404"
  },
  {
    "adresse": "23-25 RUE LAVOISIER 94230 CACHAN",
    "numeroContrat": "21500895404"
  },
  {
    "adresse": "17 RUE HENRI HEINE 75016 PARIS",
    "numeroContrat": "21580533904"
  },
  {
    "adresse": "103 RUE ALEXANDRE DUMAS 75020 PARIS",
    "numeroContrat": "21733902904"
  },
  {
    "adresse": "6/8 ROUTE DES GARDES 92190 MEUDON",
    "numeroContrat": "21753390504"
  },
  {
    "adresse": "9/11/13 AV FOCH 94100 ST MAUR DES FOSSES",
    "numeroContrat": "21761462104"
  },
  {
    "adresse": "108Q RUE VERON 94140 ALFORTVILLE",
    "numeroContrat": "21764985304"
  },
  {
    "adresse": "10 PASSAGE GAUTHIER 75019 PARIS",
    "numeroContrat": "21822779104"
  },
  {
    "adresse": "7 RUE DU SERGENT BOBILLOT 92400 COURBEVOIE",
    "numeroContrat": "22081578404"
  },
  {
    "adresse": "2 RUE LORADOUX 92270 BOIS COLOMBES",
    "numeroContrat": "4320854004"
  },
  {
    "adresse": "11 AV CARNOT 94190 VILLENEUVE ST GEORGE",
    "numeroContrat": "4503929404"
  },
  {
    "adresse": "16 AV MICHELET 93400 ST OUEN SUR SEINE",
    "numeroContrat": "4737137004"
  },
  {
    "adresse": "67 RUE MAURICE GUNSBOURG 94200 IVRY SUR SEINE",
    "numeroContrat": "4914635704"
  },
  {
    "adresse": "10 11 RUE BABEUF 94140 ALFORTVILLE",
    "numeroContrat": "6554871804"
  },
  {
    "adresse": "19BIS RUE PERRONET 92200 NEUILLY SUR SEINE",
    "numeroContrat": "7193105604"
  },
  {
    "adresse": "10 BD CARNOT 93250 VILLEMOMBLE",
    "numeroContrat": "10611897304"
  },
  {
    "adresse": "58 B AV DE LA RESISTANCE 77500 CHELLES",
    "numeroContrat": "1194636005"
  },
  {
    "adresse": "13 RUE DE BELLEFOND 75009 PARIS",
    "numeroContrat": "pa025 20954063904"
  },
  {
    "adresse": "5 IMPASSE DE L'EGLISE 75015 PARIS",
    "numeroContrat": "21523755004"
  },
  {
    "adresse": "16 RUE CHAUDRON 75010 PARIS",
    "numeroContrat": "2659621004"
  },
  {
    "adresse": "1 RUE FABERT 44100 NANTES",
    "numeroContrat": "21543180604"
  },
  {
    "adresse": "175 AVENUE VICTOR HUGO 75116 PARIS",
    "numeroContrat": "21740981804"
  },
  {
    "adresse": "147 BD DE CHARONNE 75011 PARIS",
    "numeroContrat": "21449630404"
  },
  {
    "adresse": "2 RUE DES HORTENSIAS 77164 FERRIERES EN BRIE",
    "numeroContrat": "21449616304"
  },
  {
    "adresse": "16 RUE DES ROSSAYS 91600 SAVIGNY SUR ORGE",
    "numeroContrat": "7553519904"
  },
  {
    "adresse": "2/8 RUE DES TERRASSES ET 11/13 RUE DE LA PRIEUREE ET 1 IMPASSE DES NOISETIERS 91070 BONDOUFLE",
    "numeroContrat": "2544310704"
  },
  {
    "adresse": "85 RUE DU CAPITAINE GUYNEMER 92400 COURBEVOIE",
    "numeroContrat": "10426032004"
  },
  {
    "adresse": "40 RUE ROYALE 92210 SAINT CLOUD",
    "numeroContrat": "22289904604"
  },
  {
    "adresse": "57 AV RAYMOND CROLAND 92350 LE PLESSIS ROBINSON",
    "numeroContrat": "21841885804"
  },
  {
    "adresse": "17 RUE DE VERDUN 94220 CHARENTON LE PONT",
    "numeroContrat": "22171040404"
  },
  {
    "adresse": "1 AV DE LA REDOUTE 92600 ASNIERES SUR SEINE",
    "numeroContrat": "21803239204"
  },
  {
    "adresse": "14 RUE MARY BESSEYRE 92170 VANVES",
    "numeroContrat": "10494127004"
  },
  {
    "adresse": "117 RUE DE PARIS 92110 CLICHY",
    "numeroContrat": "4172598704"
  },
  {
    "adresse": "27 RUE DU CHATEAU 92500 RUEIL MALMAISON",
    "numeroContrat": "5790177204"
  },
  {
    "adresse": "217 RUE DE L'UNIVERSITE 75007 PARIS",
    "numeroContrat": "10933340804"
  },
  {
    "adresse": "23 ALLEE PASTEUR 95100 ARGENTEUIL",
    "numeroContrat": "11268132204"
  },
  {
    "adresse": "54 56 AV DE CEINTURE 94000 CRETEIL",
    "numeroContrat": "22077744904"
  },
  {
    "adresse": "65 RUE BLANCHE 75009 PARIS",
    "numeroContrat": "22004635404"
  },
  {
    "adresse": "12 RUE CAUCHOIS 75018 PARIS",
    "numeroContrat": "21713214504"
  },
  {
    "adresse": "12 IMPASSE DU BOIS 93260 LES LILAS",
    "numeroContrat": "10563193504"
  },
  {
    "adresse": "11 RUE DIEUMEGARD 93400 SAINT OUEN",
    "numeroContrat": "21871386004"
  },
  {
    "adresse": "25 RUE LECUYER 93300 AUBERVILLIERS",
    "numeroContrat": "21573959104"
  },
  {
    "adresse": "67 RUE MAURICE GUNSBOURG 94200 IVRY SUR SEINE",
    "numeroContrat": "21765013804"
  },
  {
    "adresse": "8B RUE DE ROMAINVILLE 93260 LES LILAS",
    "numeroContrat": "4824252704"
  },
  {
    "adresse": "24 RUE LUCIEN SAMPAIX 75010 PARIS",
    "numeroContrat": "21733471404"
  },
  {
    "adresse": "85 BD JEAN JAURES 91100 CORBEIL ESSONNES",
    "numeroContrat": "21684391604"
  },
  {
    "adresse": "20 RUE MAURICE RAVEL ET RUE D'OCCOTAL 93120 LA COURNEUVE",
    "numeroContrat": "22130155904"
  },
  {
    "adresse": "83 RUE DU FAUBOURG SAINT DENIS 75010 PARIS",
    "numeroContrat": "21983685304"
  },
  {
    "adresse": "171 BIS AVENUE DU 8 MAI 1945 94170 LE PERREUX SUR MARNE",
    "numeroContrat": "22429642104"
  },
  {
    "adresse": "8 RUE ROYER COLLARD 75005 PARIS",
    "numeroContrat": "10926746604"
  },
  {
    "adresse": "20 RUE D'AUBERVILLIERS 75019 PARIS",
    "numeroContrat": "21738223804"
  },
  {
    "adresse": "3 NOUVELLE CITE DE TILLEMONT 93100 MONTREUIL",
    "numeroContrat": "3930873604"
  },
  {
    "adresse": "94 RUE ALEXANDRE FORNY 94500 CHAMPIGNY SUR MARNE",
    "numeroContrat": "10074171704"
  },
  {
    "adresse": "1/13 AVENUE DU COLONEL FABIEN 93500 PANTIN",
    "numeroContrat": "5508948404"
  },
  {
    "adresse": "205 AVENUE THIERS 33100 BORDEAUX",
    "numeroContrat": "7383806104"
  },
  {
    "adresse": "99 RUE DU CHEMIN VERT 75011 PARIS",
    "numeroContrat": "6852911604"
  },
  {
    "adresse": "84 RUE DU MONT BLANC 01220 DIVONNE LES BAINS",
    "numeroContrat": "10560517804"
  },
  {
    "adresse": "7/9 AVENUE LEFEVRE 77270 VILLEPARISIS",
    "numeroContrat": "22016902004"
  },
  {
    "adresse": "45 RUE PIERRE BROSSOLETTE 92500 RUEIL MALMAISON",
    "numeroContrat": "4108542904"
  },
  {
    "adresse": "412 RUE LOUIS BLERIOT 78530 BUC",
    "numeroContrat": "10302574804"
  },
  {
    "adresse": "37 RUE DE L'ECHIQUIER 75010 PARIS",
    "numeroContrat": "21018318004"
  },
  {
    "adresse": "29/35 AVENUE DU MARECHAL JUIN 93260 LES LILAS",
    "numeroContrat": "21488444904"
  },
  {
    "adresse": "23 AVENUE CORENTIN CARIOU 75019 PARIS",
    "numeroContrat": "21187670004"
  },
  {
    "adresse": "114 RUE DU DOCTEUR BAUER 93400 SAINT OUEN",
    "numeroContrat": "21990160804"
  },
  {
    "adresse": "2 RUE PERDONNET 75010 PARIS",
    "numeroContrat": "394940287"
  },
  {
    "adresse": "83 RUE HENRI BARBUSSE 92190 MEUDON",
    "numeroContrat": "10926746604"
  },
  {
    "adresse": "12/14 IMPASSE DE LA GROSSE BOUTEILLE 75018 PARIS",
    "numeroContrat": "7418160304"
  },
  {
    "adresse": "14 RUE DU CAPITAINE DREYFUS ET 9 AV GABRIEL PERI 93100 MONTREUIL",
    "numeroContrat": "3978357304"
  },
  {
    "adresse": "23 RUE DU FROUT 29000 QUIMPER",
    "numeroContrat": "21167888304"
  },
  {
    "adresse": "19 RUE RAYNOUARD 75016 PARIS",
    "numeroContrat": "3345358104"
  },
  {
    "adresse": "3 VILLA MODERNE 75014 PARIS",
    "numeroContrat": "20703497904"
  },
  {
    "adresse": "212 AVENUE HENRI BARBUSSE 93700 DRANCY",
    "numeroContrat": "21540143704"
  },
  {
    "adresse": "69 AVENUE ERNEST RENAN 93100 MONTREUIL",
    "numeroContrat": "21473309204"
  },
  {
    "adresse": "88/88 BIS AVENUE VICTOR CRESSON 92130 ISSY LES MOULINEAUX",
    "numeroContrat": "21904015904"
  },
  {
    "adresse": "50 RUE LEON BOURGEOIS 92700 COLOMBES",
    "numeroContrat": "3947263304"
  },
  {
    "adresse": "9 AVENUE DE LA REPUBLIQUE 94700 MAISONS ALFORT",
    "numeroContrat": "21494518504"
  },
  {
    "adresse": "6 RUE BAUDIN 94160 SAINT MANDE",
    "numeroContrat": "21919516704"
  },
  {
    "adresse": "7 RUE DUPUYTREN 75006 PARIS",
    "numeroContrat": "20951036704"
  },
  {
    "adresse": "4/6/8 RUE GEORGES HUCHON 94300 VINCENNES",
    "numeroContrat": "7587036804"
  },
  {
    "adresse": "35 BD MARCEL SEMBAT 93200 SAINT DENIS",
    "numeroContrat": "4903985704"
  },
  {
    "adresse": "48 RUE DAMREMONT 75018 PARIS",
    "numeroContrat": "5244993004"
  },
  {
    "adresse": "171 RUE DE RENNES 75006 PARIS",
    "numeroContrat": "3710133904"
  },
  {
    "adresse": "7 BIS RUE ROBESPIERRE 94500 CHAMPIGNY SUR MARNE",
    "numeroContrat": "21805554304"
  },
  {
    "adresse": "24 TER RUE PAUL BERT 94130 NOGENT SUR MARNE",
    "numeroContrat": "21492015504"
  },
  {
    "adresse": "1 RUE ANDRE BARBAUX 52100 SAINT DIZIER",
    "numeroContrat": "21378275204"
  },
  {
    "adresse": "35 AVENUE GUILLEMIN 92600 ASNIERES SUR SEINE",
    "numeroContrat": "20712987504"
  },
  {
    "adresse": "16 AU 20BIS RUE MICHEL ROCARD 69100 VILLEURBANNE",
    "numeroContrat": "21960279004"
  },
  {
    "adresse": "163 RUE DU PRESIDENT FRANCOIS MITTERRAND ET RUE HENRY DUNANT 91160 LONGJUMEAU",
    "numeroContrat": "5412680904"
  },
  {
    "adresse": "1/3 AVENUE PAUL VERLAINE 93330 NEUILLY SUR MARNE",
    "numeroContrat": "20687951104"
  },
  {
    "adresse": "135 AVENUE DE STALINGRAD 93240 STAINS",
    "numeroContrat": "21577104204"
  },
  {
    "adresse": "29/31 AVENUE DU 8 MAI 1945 94500 CHAMPIGNY SUR MARNE",
    "numeroContrat": "21611413004"
  },
  {
    "adresse": "39 RUE DES CARRIERES DE VAUCELLES 14000 CAEN",
    "numeroContrat": "21581513404"
  },
  {
    "adresse": "39 RUE ERNEST RENAN 92130 ISSY LES MOULINEAUX",
    "numeroContrat": "4629903604"
  },
  {
    "adresse": "32 MAIL DU NEUTRINO - BAT 3 1280 PREVESSIN MOENS",
    "numeroContrat": "21561500404"
  },
  {
    "adresse": "32 MAIL DU NEUTRINO - VILLAS 1 A 23 1280 PREVESSIN MOENS",
    "numeroContrat": "21561666904"
  },
  {
    "adresse": "32 MAIL DU NEUTRINO - BAT 1 1280 PREVESSIN MOENS",
    "numeroContrat": "21561485704"
  },
  {
    "adresse": "32 MAIL DU NEUTRINO - BAT 2 1280 PREVESSIN MOENS",
    "numeroContrat": "21561493104"
  },
  {
    "adresse": "32 MAIL DU NEUTRINO - VILLAS 24 A 46 1280 PREVESSIN MOENS",
    "numeroContrat": "21561739004"
  },
  {
    "adresse": "40/44 RUE DU MARQUIS DE RAIES 91080 EVRY COURCOURONNES",
    "numeroContrat": "7533811604"
  },
  {
    "adresse": "221 RUE DE SOLFERINO 59800 LILLE",
    "numeroContrat": "21325861904"
  },
  {
    "adresse": "11 AVENUE DU CANAL 91700 SAINTE GENEVIEVE DES BOIS",
    "numeroContrat": "2646270004"
  },
  {
    "adresse": "2 RUE TRAVERSIERE 71200 LE CREUSOT",
    "numeroContrat": "2821143804"
  },
  {
    "adresse": "26 RUE DE SAMBRE ET MEUSE 75010 PARIS",
    "numeroContrat": "21500381404"
  },
  {
    "adresse": "75 GRANDE RUE CHARLES DE GAULLE 94130 NOGENT SUR MARNE",
    "numeroContrat": "3017791104"
  },
  {
    "adresse": "10 AVENUE RAOUL FOLLEREAU BAT F ET G 13011 MARSEILLE",
    "numeroContrat": "7529878004"
  },
  {
    "adresse": "32 RUE RAYMOND MARCHERON 92170 VANVES",
    "numeroContrat": "4263006004"
  },
  {
    "adresse": "16 AVENUE DU GENERAL DE GAULLE 29890 PLOUNEOUR BRIGNOGAN PLAGES",
    "numeroContrat": "32980041051587"
  },
  {
    "adresse": "14/18 RUE DE LA CLOCHE 77300 FONTAINEBLEAU",
    "numeroContrat": "21808382804"
  },
  {
    "adresse": "131 RUE MARCADET 75018 PARIS",
    "numeroContrat": "6262854104"
  },
  {
    "adresse": "102 RUE DU DOME 92100 BOULOGNE BILLANCOURT",
    "numeroContrat": "10840933404"
  },
  {
    "adresse": "15 RUE DE SOFIA 75018 PARIS",
    "numeroContrat": "5745588804"
  },
  {
    "adresse": "2 AVENUE DES JOCKEYS 92380 GARCHES",
    "numeroContrat": "21527766904"
  },
  {
    "adresse": "12 RUE DE LA LIBERTE 75019 PARIS",
    "numeroContrat": "21924715604"
  },
  {
    "adresse": "99/101 AVENUE DE LA REPUBLIQUE 93150 LE BLANC MESNIL",
    "numeroContrat": "21886318104"
  },
  {
    "adresse": "183/185 BD ANATOLE FRANCE ET 6/8/12 RUE DU DOCTUR FINOT 93200 SAINT DENIS",
    "numeroContrat": "22008310304"
  },
  {
    "adresse": "450 AVENUE ROGER SALENGRO 92370 CHAVILLE",
    "numeroContrat": "2544587904"
  },
  {
    "adresse": "4/6 GRANDE RUE 74440 TANINGES",
    "numeroContrat": "3849713404"
  },
  {
    "adresse": "17 RUE SAINT LOUIS 77000 MELUN",
    "numeroContrat": "21882744804"
  },
  {
    "adresse": "34 RUE DE LA CERISAIE 73100 GRESY SUR AIX",
    "numeroContrat": "10596814204"
  },
  {
    "adresse": "20 RUE ADELAIDE TABLON 92000 NANTERRE",
    "numeroContrat": "22214890604"
  },
  {
    "adresse": "28 RUE MAURICE PELLETIER 92270 BOIS COLOMBES",
    "numeroContrat": "10611904704"
  },
  {
    "adresse": "94 AVENUE DE CHOISY 75013 PARIS",
    "numeroContrat": "21500376804"
  },
  {
    "adresse": "374/378 AV DE LA DIVISION LECLERC 92290 CHATENAY MALABRY",
    "numeroContrat": "10371143204"
  },
  {
    "adresse": "63/65 RUE EUGENE CARON 92400 COURBEVOIE",
    "numeroContrat": "22420676004"
  },
  {
    "adresse": "22 RUE FEUTRIER 75018 PARIS",
    "numeroContrat": "21570079004"
  },
  {
    "adresse": "18 RUE GUENEGAUD 75006 PARIS",
    "numeroContrat": "1683998604"
  },
  {
    "adresse": "21 BD DE LA VILLETTE 75010 PARIS",
    "numeroContrat": "22155712104"
  },
  {
    "adresse": "1 ALLEE DES MURIERS 95350 SAINT BRICE SOUS FORET",
    "numeroContrat": "21301889404"
  },
  {
    "adresse": "11 A 15 RUE GEORGES GAY 93130 NOISY LE SEC",
    "numeroContrat": "20841211904"
  },
  {
    "adresse": "15 RUE GEORGES HUCHON 94300 VINCENNES",
    "numeroContrat": "21706382904"
  },
  {
    "adresse": "8 RUE DES MECHES 94000 CRETEIL",
    "numeroContrat": "22033092104"
  },
  {
    "adresse": "12 AVENUE GAMBETTA 94600 CHOISY LE ROI",
    "numeroContrat": "10614012904"
  },
  {
    "adresse": "7 SENTIER DES JARDINS 91160 LONGJUMEAU",
    "numeroContrat": "20738590304"
  },
  {
    "adresse": "147/157 BD ROBERT BALLANGER 93420 VILLEPINTE",
    "numeroContrat": "21057067204"
  },
  {
    "adresse": "33 RUE JULES AUFFRET 93500 PANTIN",
    "numeroContrat": "4493957604"
  },
  {
    "adresse": "12 RUE POMMIER 94190 VILLENEUVE SAINT GEORGES",
    "numeroContrat": "22419546804"
  },
  {
    "adresse": "183 RUE CHAMPIONNET 75018 PARIS",
    "numeroContrat": "10147716004"
  },
  {
    "adresse": "262 AVENUE JEAN JAURES 95100 ARGENTEUIL",
    "numeroContrat": "10400206904"
  },
  {
    "adresse": "241/243 RUE DE BERCY 75012 PARIS",
    "numeroContrat": "21585583604"
  },
  {
    "adresse": "271 RUE DU PROFESSEUR CALMETTE 95120 ERMONT",
    "numeroContrat": "3268592304"
  },
  {
    "adresse": "34/36/38 RUE DE FONTENAY 92320 CHATILLON",
    "numeroContrat": "21450559404"
  },
  {
    "adresse": "1 RUE DE LA FERME 94170 LE PERREUX SUR MARNE",
    "numeroContrat": "5582381704"
  },
  {
    "adresse": "164 AVENUE DU GENERAL LECLERC 92330 SCEAUX",
    "numeroContrat": "7557395404"
  },
  {
    "adresse": "3 ALLEE LEON GAMBETTA 92110 CLICHY",
    "numeroContrat": "21862532804"
  },
  {
    "adresse": "5/7 RUE JEAN-BAPTISTE FORTIN 92220 BAGNEUX",
    "numeroContrat": "22266512204"
  },
  {
    "adresse": "142 AV HENRI BARBUSSE ET 8 RUE GUY DE PAUPASSANT 93140 BONDY",
    "numeroContrat": "21667935704"
  },
  {
    "adresse": "30 BIS RUE GARIBALDI 93400 SAINT OUEN",
    "numeroContrat": "10599168004"
  },
  {
    "adresse": "87 RUE DES COTES 78600 MAISONS LAFFITTE",
    "numeroContrat": "22446704004"
  },
  {
    "adresse": "27 RUE CHATEAUNEUF 6000 NICE",
    "numeroContrat": "21892936804"
  },
  {
    "adresse": "1/3 BD JEAN JAURES 94260 FRESNES",
    "numeroContrat": "21969045404"
  },
  {
    "adresse": "39/41 RUE LOUISE MICHEL 69200 VENISSIEUX",
    "numeroContrat": "22234309204"
  },
  {
    "adresse": "27 RUE SAULNIER 92800 PUTEAUX",
    "numeroContrat": "22446704004"
  },
  {
    "adresse": "3 RUE DU BEL AIR 93100 MONTREUIL",
    "numeroContrat": "6864710204"
  },
  {
    "adresse": "3/7 RUE GAETAN 93330 AUBERVILLIERS",
    "numeroContrat": "22002502904"
  },
  {
    "adresse": "24 BD DE STALINGRAD 94600 CHOISY LE ROI",
    "numeroContrat": "21913236604"
  },
  {
    "adresse": "10 RUE DU GRAND PRIEURE 75011 PARIS",
    "numeroContrat": "22170119904"
  },
  {
    "adresse": "1 RUE ANATOLE FRANCE 94600 CHOISY LE ROI",
    "numeroContrat": "2965618304"
  },
  {
    "adresse": "19 RUE CHARRON 93300 AUBERVILLIERS",
    "numeroContrat": "21252005104"
  },
  {
    "adresse": "123 ROUTE DE CROISSY 78110 LE VESINET",
    "numeroContrat": "21772911904"
  },
  {
    "adresse": "64 AVENUE DE PARIS 78000 VERSAILLES",
    "numeroContrat": "21049663204"
  },
  {
    "adresse": "169/171/173 AV PAUL VAILLANT COUTURIER ET 1/3 AV DE SUFFREN 93150 LE BLANC MESNIL",
    "numeroContrat": "22324565404"
  },
  {
    "adresse": "17/19B RUE LEO GAUSSON 77400 LAGNY SUR MARNE",
    "numeroContrat": "21705670704"
  },
  {
    "adresse": "11 AVENUE DE STALINGRAD 94120 FONTENAY SOUS BOIS",
    "numeroContrat": "22210235004"
  },
  {
    "adresse": "109 RUE DEFRANCE 94300 VINCENNES",
    "numeroContrat": "22447833604"
  },
  {
    "adresse": "14 RUE JOUYE ROUVE 75020 PARIS",
    "numeroContrat": "22219326004"
  },
  {
    "adresse": "232 BD VOLTAIRE ET 40 RUE DES BOULETS 75011 PARIS",
    "numeroContrat": "22163299504"
  },
  {
    "adresse": "10 RUE DES DEUX GARES 75010 PARIS",
    "numeroContrat": "10356590004"
  },
  {
    "adresse": "143 RUE LAMARCK 75018 PARIS",
    "numeroContrat": "5186775004"
  },
  {
    "adresse": "20 COUR DES PETITES ECURIES 75010 PARIS",
    "numeroContrat": "5433658904"
  },
  {
    "adresse": "10 RUE JEAN DOLLFUS 75018 PARIS",
    "numeroContrat": "21876319304"
  },
  {
    "adresse": "3 RUE DES BONS ENFANTS 78100 SAINT GERMAIN EN LAYE",
    "numeroContrat": "10229397904"
  },
  {
    "adresse": "2 A 16 AV JEANNE D'ARC ET 4/6/8 RUE LESNE 93200 SAINT DENIS",
    "numeroContrat": "10100872904"
  },
  {
    "adresse": "2 A 16 RUE DE LA PRAIRIE ET 1 A 11 ALLEE DES ORMEAUX 92160 ANTONY",
    "numeroContrat": "20000782780587"
  },
  {
    "adresse": "52/54/56 AVENUE JEAN MONNET 92160 ANTONY",
    "numeroContrat": "20000737719587"
  },
  {
    "adresse": "11 RUE VERON 94140 ALFORTVILLE",
    "numeroContrat": "3799326204"
  },
  {
    "adresse": "4 ROUTE DU CHENE 74330 LA BALME DE SILLINGY",
    "numeroContrat": "5784397704"
  },
  {
    "adresse": "14 RUE CHAILLON 92390 VILLENEUVE LA GARENNE",
    "numeroContrat": "21851902504"
  },
  {
    "adresse": "15 RUE D'ESTIENNE D'ORVES 91370 VERRIERES LE BUISSON",
    "numeroContrat": "1062493805"
  },
  {
    "adresse": "49 RUE DESIRE PREAUX 93100 MONTREUIL",
    "numeroContrat": "10220385704"
  },
  {
    "adresse": "39 RUE FRANCOIS RUDE 93700 DRANCY",
    "numeroContrat": "21252367304"
  },
  {
    "adresse": "35/37 RUE DE TORCY 75018 PARIS",
    "numeroContrat": "21596350904"
  },
  {
    "adresse": "24 RUE MARCA 64000 PAU",
    "numeroContrat": "21285677904"
  },
  {
    "adresse": "21/23 RUE DES FIGUIERS BLANCS ET 54 ROUTE DE PONTOISE 95100 ARGENTEUIL",
    "numeroContrat": "21500897504"
  },
  {
    "adresse": "34-36 AVENUE DE LA REPUBLIQUE 93150 LE BLANC MESNIL",
    "numeroContrat": "21551460604"
  },
  {
    "adresse": "24 RUE MARCADET ET 43 RUE ORDENER 75018 PARIS",
    "numeroContrat": "22005471804"
  },
  {
    "adresse": "14/18 BD MAURICE BERTEAUX ET 1 ALLEE D'ORGEMONT 95110 SANNOIS",
    "numeroContrat": "21414281404"
  },
  {
    "adresse": "18 RUE CREBILLON 94300 VINCENNES",
    "numeroContrat": "39376041743287"
  },
  {
    "adresse": "44 RUE DESBORDES VALMORE 75116 PARIS",
    "numeroContrat": "2986637204"
  },
  {
    "adresse": "1 RUE CLAPEYRON 75008 PARIS",
    "numeroContrat": "21500363004"
  },
  {
    "adresse": "22/24 RUE DE LA TERRASSE 75017 PARIS",
    "numeroContrat": "3134294104"
  },
  {
    "adresse": "80 RUE DE PARIS 92110 CLICHY",
    "numeroContrat": "4685243904"
  },
  {
    "adresse": "691 AVENUE FOCH 78670 VILLENNES SUR SEINE",
    "numeroContrat": "10776535404"
  },
  {
    "adresse": "25/2729 RUE PROSPER LEGOUTE BAT H 92160 ANTONY",
    "numeroContrat": "20000737718887"
  },
  {
    "adresse": "61 AVENUE DU GENERAL DE GAULLE 92800 PUTEAUX",
    "numeroContrat": "21413163604"
  },
  {
    "adresse": "67/87/97 RUE DE GENEVE 01170 CESSY",
    "numeroContrat": "21275714604"
  },
  {
    "adresse": "2 RUE CHARLES DREZET 91100 CORBEIL ESSONNES",
    "numeroContrat": "10277495704"
  },
  {
    "adresse": "21 RUE CARTIER BRESSON 93500 PANTIN",
    "numeroContrat": "20188297504"
  },
  {
    "adresse": "25 AVENUE GABRIEL 92000 NANTERRE",
    "numeroContrat": "37524040712687"
  },
  {
    "adresse": "210 AVENUE PASTEUR ET 193 RUE SADI CARNOT 93170 BAGNOLET",
    "numeroContrat": "22150067804"
  },
  {
    "adresse": "20 RUE PAUL CEZANNE 94320 THIAIS",
    "numeroContrat": "21710688104"
  },
  {
    "adresse": "8/10/12 RUE COLAS 77400 DAMPMART",
    "numeroContrat": "21778383804"
  },
  {
    "adresse": "30 RUE MARQUET ET 43 RUE DENIS PAPIN 92700 COLOMBES",
    "numeroContrat": "6423153004"
  },
  {
    "adresse": "76 RUE MURILLO 92170 VANVES",
    "numeroContrat": "518180204"
  },
  {
    "adresse": "34/38 AVENUE DU GENERAL DE GAULLE 93110 ROSNY SOUS BOIS",
    "numeroContrat": "4352751404"
  },
  {
    "adresse": "18 AVENUE DU MARECHAL DE LATTRE DE TASSIGNY 92360 MEUDON LA FORET",
    "numeroContrat": "20884250704"
  },
  {
    "adresse": "11 RUE TIQUETONNE 75002 PARIS",
    "numeroContrat": "21645245304"
  },
  {
    "adresse": "ASL 10 BIS RUE MEHUL 93500 PANTIN",
    "numeroContrat": "10793293804"
  },
  {
    "adresse": "24 AVENUE DE VALBERG 06470 PEONE",
    "numeroContrat": "5177357204"
  },
  {
    "adresse": "114 RUE DE BAGNOLET 75020 PARIS",
    "numeroContrat": "6647490504"
  },
  {
    "adresse": "17 RUE GABRIELLE JOSSERAND 93500 PANTIN",
    "numeroContrat": "22160409104"
  },
  {
    "adresse": "58 BIS AVENUE DE LA RESISTANCE 77550 CHELLES",
    "numeroContrat": "22254387304"
  },
  {
    "adresse": "20 RUE TIQUETONNE 75002 PARIS",
    "numeroContrat": "4046164104"
  },
  {
    "adresse": "64 AVENUE JEAN JAURES 51200 EPERNAY",
    "numeroContrat": "2944530004"
  },
  {
    "adresse": "2-14 ALLEE DES PLATANES ET 46 AV JEAN MONEET ET 1-11 RUE DE LA PRAIRIE 92160 ANTONY",
    "numeroContrat": "'20000782839687"
  },
  {
    "adresse": "10 RUE BERNARD DE JUSSIEU 78000 VERSAILLES",
    "numeroContrat": "21103530904"
  },
  {
    "adresse": "8 RUE DES GRANGES 77000 MELUN",
    "numeroContrat": "7197615604"
  },
  {
    "adresse": "1-3-5 RUE DE LA MENUISERIE ET RUE HENRI LOUX 67770 SESSENHEIM",
    "numeroContrat": "21625478904"
  },
  {
    "adresse": "2 RUE DU CENTRE DE SECOURS 22300 LANNION",
    "numeroContrat": "20777931404"
  },
  {
    "adresse": "2BIS ET 2TER PASSAGE DE CLICHY 75018 PARIS",
    "numeroContrat": "5326142104"
  },
  {
    "adresse": "5 RUE DES SABLONS 75016 PARIS",
    "numeroContrat": "5281478404"
  },
  {
    "adresse": "52 RUE HENRI DUNANT 92700 COLOMBES",
    "numeroContrat": "7335396304"
  },
  {
    "adresse": "36/38 RUE JULES GUESDE 93220 GAGNY",
    "numeroContrat": "7397365504"
  },
  {
    "adresse": "2 RUE D'ALEMBERT 93100 MONTREUIL",
    "numeroContrat": "5672429904"
  },
  {
    "adresse": "55 RUE DE STRASBOURG 95240 CORMEILLES EN PARISIS",
    "numeroContrat": "10923851104"
  },
  {
    "adresse": "5 RUE DU RUISSEAU 75018 PARIS",
    "numeroContrat": "21149007304"
  },
  {
    "adresse": "13 RUE ETIENNE DOLET 94460 VALENTON",
    "numeroContrat": "10570732004"
  },
  {
    "adresse": "192 AVENUE HENRI BARBUSSE 93700 DRANCY",
    "numeroContrat": "10568171904"
  },
  {
    "adresse": "27 RUE DU VIEUX VERSAILLES 78000 VERSAILLES",
    "numeroContrat": "10190663404"
  },
  {
    "adresse": "49 RUE ROUGET DE LISLE 92150 SURESNES",
    "numeroContrat": "22157090904"
  },
  {
    "adresse": "68 RUE VICTOR HUGO 93170 BAGNOLET",
    "numeroContrat": "6936594704"
  }
],
  GENERALI: [],
  SADA: [
  {
    "adresse": "SDC 4 Villa de la Dame Blanche - 4 Villa de la Dame Blanche, 94120 Fontenay-sous-Bois",
    "numeroContrat": "1H0260498"
  },
  {
    "adresse": "31 bis rue Orphila 75020 Paris",
    "numeroContrat": "01351737-27 / 01530045-1059"
  },
  {
    "adresse": "69 Rue Victor Hugo 92700 Colombes",
    "numeroContrat": "9H8165038 / 8165038"
  },
  {
    "adresse": "Parc Guidotti - 3 Impasse Guidotti 06300 Nice",
    "numeroContrat": "1H0251704"
  },
  {
    "adresse": "7 rue de la barbacane 93200 Saint-Denis",
    "numeroContrat": "1H0383658"
  },
  {
    "adresse": "29 Av. du 8 Mai 1945 94500 Champigny-sur-Marne",
    "numeroContrat": "0146654710"
  },
  {
    "adresse": "39 Bd Henri Barbusse 93230 Romainville",
    "numeroContrat": "1H0292998"
  },
  {
    "adresse": "70 Bd Saint-Jean 13010 Marseille",
    "numeroContrat": "1H0419652"
  },
  {
    "adresse": "24 rue de la Chalotet 35000 Rennes",
    "numeroContrat": "1H0174903"
  },
  {
    "adresse": "3 Allée Bernard Palissy 92400 Courbevoie",
    "numeroContrat": "1H0171290"
  },
  {
    "adresse": "Les Jardins de Diane - 23 Bis Rue du Général de Gaulle 77000 Melun",
    "numeroContrat": "1H0358044 / 1P0055971"
  },
  {
    "adresse": "128 Rue du Chemin Vert 75011 Paris",
    "numeroContrat": "1H03833727"
  },
  {
    "adresse": "167 Bd Charles de Gaulle 92700 Colombes",
    "numeroContrat": "01530045-157"
  },
  {
    "adresse": "86 rue Robespierre 93100 Montreuil",
    "numeroContrat": "1H0305334 / 1H0410279 / 1H0410267"
  },
  {
    "adresse": "49 Rue de Paris 93230 Romainville",
    "numeroContrat": "1H0232862"
  },
  {
    "adresse": "203 Av. Pierre Brossolette 92120 Montrouge",
    "numeroContrat": "1H0279314"
  },
  {
    "adresse": "57 Rue de Château d'eau 75010 Paris",
    "numeroContrat": "1H0157674"
  },
  {
    "adresse": "7 rue Tholozé 75018 Paris",
    "numeroContrat": "01530045-1000"
  },
  {
    "adresse": "14 rue de la Réunion 75020 Paris",
    "numeroContrat": "1H0275122 / 01907328198"
  },
  {
    "adresse": "13 Rue Tustal 33000 Bordeaux",
    "numeroContrat": "1H0292347"
  },
  {
    "adresse": "236 avenue Charles Floquet 93150 Le Blanc-Mesnil",
    "numeroContrat": "1H0420195"
  },
  {
    "adresse": "8 rue des mèches 94000 Créteil",
    "numeroContrat": "1H0107514"
  },
  {
    "adresse": "15 Rue Georges Huchon 94300 Vincennes",
    "numeroContrat": "1H0049494"
  },
  {
    "adresse": "12-14 Mail des Corses 77100 Meaux",
    "numeroContrat": "0134171229"
  },
  {
    "adresse": "272 ter avenue de la Californie 06200 Nice",
    "numeroContrat": "1H0222325"
  },
  {
    "adresse": "la rue Robert Desno 93380 Pierrefitte-sur-Seine",
    "numeroContrat": "1H0413513"
  },
  {
    "adresse": "3 Rue du Commandant Kieffer 95240 Cormeilles-en-Parisis",
    "numeroContrat": "1H0428467 / L186D"
  },
  {
    "adresse": "7 Avenue d'Alsace Lorraine 93130 Noisy-le-Sec",
    "numeroContrat": "1H0311900 / 1H0088171"
  },
  {
    "adresse": "36 rue des Cites 93300 Aubervilliers",
    "numeroContrat": "1H0280155"
  },
  {
    "adresse": "1 rue Jules Vincent 95410 Groslay",
    "numeroContrat": "1H0063874"
  },
  {
    "adresse": "ASL 5 Route de la Treille 13011 Marseille",
    "numeroContrat": "1H0390168 / 1H0291626"
  },
  {
    "adresse": "19 Rue Chevreul 93500 Pantin",
    "numeroContrat": "1H0289937"
  },
  {
    "adresse": "6 Rue Jean Piestre 91100 Corbeil-Essonnes",
    "numeroContrat": "1H0277642"
  },
  {
    "adresse": "2 Av. des Platanes 78860 Saint-Nom-la-Bretèche",
    "numeroContrat": "1H0381957"
  },
  {
    "adresse": "8 r nicolas leblanc 93200 Saint-Denis",
    "numeroContrat": "1H0289197"
  },
  {
    "adresse": "29 Av. de Paris 94300 Vincennes",
    "numeroContrat": "1H0424155"
  },
  {
    "adresse": "121 bd jean jaures 92110 Clichy",
    "numeroContrat": "1H0174515"
  },
  {
    "adresse": "55 Rue Marceau 94130 Nogent-sur-Marne",
    "numeroContrat": "0133997019"
  },
  {
    "adresse": "1 Rue Jean Moulin et 4 bis rue du Parc à foulon - résidence du Grimpré 91140 Villebon-sur-Yvette",
    "numeroContrat": "3PC00000020717"
  },
  {
    "adresse": "47 Avenue Dumotel 94230 Cachan",
    "numeroContrat": "1H0239563"
  },
  {
    "adresse": "199 avenue d'argenteuil 92270 Bois-Colombes",
    "numeroContrat": "1H0380598"
  },
  {
    "adresse": "Les Terrasses d'Eugénie - 5-7-9-11-13-17-19 rue François Jacob 69100 Villeurbanne",
    "numeroContrat": "1H0353357"
  },
  {
    "adresse": "3 Bd National 92000 Rueil-Malmaison",
    "numeroContrat": "1H0393267"
  },
  {
    "adresse": "87 Rue Romain Rolland 69120 Vaulx-en-Velin",
    "numeroContrat": "1H0094532"
  },
  {
    "adresse": "Hortea - 99 Av. Gaston Roussel 93230 Romainville",
    "numeroContrat": "1H0414240"
  },
  {
    "adresse": "Zen et Sens - Copropriété Zen et Sens - 80-120 rue de la Fraternité & 94-110 rue de l'égalité 78955 Carrières-sous-Poissy",
    "numeroContrat": "1P0050190"
  },
  {
    "adresse": "53 Rue de Neauphle 78112 Saint-Germain-en-Laye",
    "numeroContrat": "01461377-21"
  },
  {
    "adresse": "19 Rue Daru 75008 Paris",
    "numeroContrat": "1H0255567"
  },
  {
    "adresse": "23 Rue Richer 75009 Paris",
    "numeroContrat": "1H0270978"
  },
  {
    "adresse": "17 Rue Blondel 75002 Paris",
    "numeroContrat": "1H0387720"
  },
  {
    "adresse": "ASL 73 route de Portet 31140 Villeneuve-Tolosane",
    "numeroContrat": "1H025442"
  },
  {
    "adresse": "(COP 366) SDC 70-72 Rue Saint Denis 92700 Colombes",
    "numeroContrat": "1H0337072"
  },
  {
    "adresse": "24 Rue Pajol 75018 PARIS",
    "numeroContrat": "1H0286693"
  },
  {
    "adresse": "24 boulevard de valmy 92700 Colombes",
    "numeroContrat": "1H0335815"
  },
  {
    "adresse": "(COP 668) SDC 69 boulevard Victor Hugo 92200 Neuilly-sur-Seine",
    "numeroContrat": "1H0407466"
  },
  {
    "adresse": "2 Av. Jacques Duclos et 168 Av. Pasteur 93150 Le Blanc-Mesnil",
    "numeroContrat": "1H0362220"
  },
  {
    "adresse": "29 Rue de Moscou 75008 Paris",
    "numeroContrat": "01018691"
  },
  {
    "adresse": "16 Rue Cail 75010 Paris",
    "numeroContrat": "1H0410267"
  },
  {
    "adresse": "192 Rue Marcadet 75018 Paris",
    "numeroContrat": "1H0249481"
  },
  {
    "adresse": "22 Rue Durantin 75018 Paris",
    "numeroContrat": "1H0381052"
  },
  {
    "adresse": "2 Rue de Prony 92600 Asnières-sur-Seine",
    "numeroContrat": "1H0266972"
  },
  {
    "adresse": "Résidence Le Plein Ciel - 64-66-68-70 Rue Challemel-Lacour 69007 Lyon",
    "numeroContrat": "1H0339187"
  },
  {
    "adresse": "Vita - Résidence Vita, 21-23 Rue des Écoles-18 rue du Jura 74100 Ambilly",
    "numeroContrat": "1H0378237"
  },
  {
    "adresse": "61-63 Terrasse de l'Arche 92000 Nanterre",
    "numeroContrat": "1H0335042"
  },
  {
    "adresse": "19 rue Guilleminot 92370 Chaville",
    "numeroContrat": "1H0408859"
  },
  {
    "adresse": "Saint-Louis - 26 bis rue saint louis 78000 Versailles",
    "numeroContrat": "1H0353693"
  },
  {
    "adresse": "16 Rue Bernard 13003 Marseille",
    "numeroContrat": "1H0359327"
  },
  {
    "adresse": "21 rue Saint-Lambert 75015 Paris",
    "numeroContrat": "1H0360078"
  },
  {
    "adresse": "6 Rue d'Amiens 13003 Marseille",
    "numeroContrat": "1H0290562"
  },
  {
    "adresse": "8 rue Balzac 75008 Paris",
    "numeroContrat": "1H0337145"
  },
  {
    "adresse": "178 Avenue Jean Lolive 93500 Pantin",
    "numeroContrat": "1H0246254"
  },
  {
    "adresse": "61-67 avenue Gambette 94700 Maisons-Alfort",
    "numeroContrat": "1H0354692"
  },
  {
    "adresse": "67 Avenue de France 75013 Paris",
    "numeroContrat": "1H0379026"
  },
  {
    "adresse": "20 Rue Raymond Fassin 92240 Malakoff",
    "numeroContrat": "97606"
  },
  {
    "adresse": "41 Rue du Bas Rucourt, 41-43, 95180 Menucourt",
    "numeroContrat": "1H0294667"
  },
  {
    "adresse": "15 bis Rue du General Gallieni 78220 Viroflay",
    "numeroContrat": "1H0244278"
  },
  {
    "adresse": "Villa Angelina 2 - 143-145-147 Rue Nelson Mandela 01630 Saint-Genis-Pouilly",
    "numeroContrat": "01530049-1151"
  },
  {
    "adresse": "45-47 rue Pauline Borghèse 92200 Neuilly-sur-Seine",
    "numeroContrat": "1H0395398"
  },
  {
    "adresse": "3-5 voie Paul Eluard 94380 Bonneuil-sur-Marne",
    "numeroContrat": "1H0354545"
  },
  {
    "adresse": "72 Rue Anatole France 92300 Levallois-Perret",
    "numeroContrat": "1H0297553"
  },
  {
    "adresse": "30 rue Jean-Jaurès 94510 La Queue-en-Brie",
    "numeroContrat": "1H0091509"
  },
  {
    "adresse": "28 Rue du Petit Houx 95200 Sarcelles",
    "numeroContrat": "1H0257880"
  },
  {
    "adresse": "32 Rue Gambetta 69270 Fontaines-sur-Saône",
    "numeroContrat": "1H0257063"
  },
  {
    "adresse": "Niwa - 1 Rue Aristide Briand 92170 Vanves",
    "numeroContrat": "1H0333160"
  },
  {
    "adresse": "113 avenue Raspail 94250 Gentilly",
    "numeroContrat": "1H0335525"
  },
  {
    "adresse": "221 Avenue d'Argenteuil 92270 Bois-colombe",
    "numeroContrat": "5H0361058"
  },
  {
    "adresse": "19 Av. Faidherbe 92600 Asnières-sur-Seine",
    "numeroContrat": "1H0289690"
  },
  {
    "adresse": "16-18 avenue Jacques Jézéquel et 3 allée du Progrès 92170 Vanves",
    "numeroContrat": "1H0314463"
  },
  {
    "adresse": "13 Rue du Couëdic 75014 Paris",
    "numeroContrat": "1H0061874"
  },
  {
    "adresse": "1 Avenue des Sports 01210 Ferney-Voltaire",
    "numeroContrat": "1H0280211"
  },
  {
    "adresse": "9 Bis Rue Jean Jaurès 95400 Arnouville",
    "numeroContrat": "1H0310348"
  },
  {
    "adresse": "4 rue Miriam Makeba 93500 Pantin",
    "numeroContrat": "1H0337985"
  },
  {
    "adresse": "22 Rue Moncey 75009 Paris",
    "numeroContrat": "1H0289509"
  },
  {
    "adresse": "2 rue du Grand Prieuré, 75011 Paris",
    "numeroContrat": "1H0152110"
  },
  {
    "adresse": "32 Rue Albert 1er, 92600 Asnières-sur-Seine",
    "numeroContrat": "1H0351144"
  },
  {
    "adresse": "72 Route de la Libération, 69110 Sainte-Foy-lès-Lyon",
    "numeroContrat": "1H0289928"
  },
  {
    "adresse": "94 Rue Youri Gagarine, 92700 Colombes",
    "numeroContrat": "1H0309321"
  },
  {
    "adresse": "149 rue de Charenton, 75012 Paris",
    "numeroContrat": "1H0371638"
  },
  {
    "adresse": "99 Rue Hippolyte Kahn, 69100 Villeurbanne",
    "numeroContrat": "MR-006148"
  },
  {
    "adresse": "58E route des Creuses, 74960 Cran-Gevrier",
    "numeroContrat": "01530049-1118"
  },
  {
    "adresse": "300 boulevard des Deux Ormes, 13090 Aix-en-Provence",
    "numeroContrat": "1H0378079"
  },
  {
    "adresse": "122 boulevard Rabatau, 13010 Marseille",
    "numeroContrat": "1H0340866"
  },
  {
    "adresse": "96/102 rue Roque de Fillol 7/9/11/11b rue Paul Lafargue, 92800 Puteaux",
    "numeroContrat": "01530045-994"
  },
  {
    "adresse": "4-7 place Camille Georges, 69002 Lyon",
    "numeroContrat": "01530049-1169"
  },
  {
    "adresse": "113 avenue Raspail, 94250 Gentilly",
    "numeroContrat": "1H0343388"
  },
  {
    "adresse": "33 Rue du Maréchal de Lattre de Tassigny, 94140 Alfortville",
    "numeroContrat": "1H0364844"
  },
  {
    "adresse": "77 Av. de la Bourdonnais, 75007 Paris",
    "numeroContrat": "1H0175917"
  },
  {
    "adresse": "10-12 All. de Provence, 92000 Nanterre",
    "numeroContrat": "1H0317781"
  },
  {
    "adresse": "7 rue du petit Chanteloup, 78570 Chanteloup-les-Vignes",
    "numeroContrat": "1H0273011"
  },
  {
    "adresse": "2 Rue de la Jeunesse, 13005 Marseille",
    "numeroContrat": "1H0342492"
  },
  {
    "adresse": "7 Rue de Montholon, 75009 Paris",
    "numeroContrat": "1H0319807"
  },
  {
    "adresse": "57 rue des Epinettes, 75017 Paris",
    "numeroContrat": "1H0302605"
  },
  {
    "adresse": "300 Grand Rue, 74160 Beaumont",
    "numeroContrat": "1H0198830"
  },
  {
    "adresse": "7 Rue Léon Blum, 69100 Villeurbanne",
    "numeroContrat": "1H0351378"
  },
  {
    "adresse": "1 Mail Roger Prévot, 92390 Villeneuve-la-Garenne",
    "numeroContrat": "1H0409268"
  },
  {
    "adresse": "9 quai de l’Artois, 94170 Le Perreux-sur-Marne",
    "numeroContrat": "1H0382699"
  },
  {
    "adresse": "4 rue des volontaires, 75015 Paris",
    "numeroContrat": "01530045-1037"
  },
  {
    "adresse": "98 traverse charles susini, 13013 Marseille",
    "numeroContrat": "1H0396146"
  },
  {
    "adresse": "31 bis rue Orfila, 75020 Paris",
    "numeroContrat": "01530045-1059"
  },
  {
    "adresse": "1 Rue Lagille, 75018 Paris, FRANCE",
    "numeroContrat": "1H0111169"
  },
  {
    "adresse": "31 rue Carnot, 92150 Suresnes, FRANCE",
    "numeroContrat": "1H0411227"
  },
  {
    "adresse": "72 Rue Carnot, 93230 Romainville, FRANCE",
    "numeroContrat": "1H0406544"
  },
  {
    "adresse": "200 Rue de Paris, 93100 Montreuil, FRANCE",
    "numeroContrat": "1H0378479"
  }
],
  MILA: [],
};
