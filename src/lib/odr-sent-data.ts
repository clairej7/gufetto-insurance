// ODR déjà envoyés par assureur, INGÉRÉS DEPUIS LES DOCS fournis par Quentin.
// Sert de référence au contrôle anti-doublon (avec, en plus, les dossiers déjà
// passés en « ODR envoyées / acceptées / en vigueur » côté base).
//
// Pour mettre à jour : ré-ingérer les docs d'un assureur et remplacer son tableau.
// Format : { adresse, numeroContrat }. L'adresse telle qu'écrite dans le doc ;
// le n° tel qu'écrit (les multi-n° "A / B" sont gérés par le matcher).
//
// SADA : 123 ODR, ingérés le 2026-08-06 depuis "ODR SADA 2", "ODR Sada - 03_08_2026",
// "ODR Sada - 24_07_2026" (dédupliqués).

export type OdrSentRecord = { adresse: string; numeroContrat: string };

export const ODR_SENT_DOCS: Record<"AXA" | "GENERALI" | "SADA" | "MILA", OdrSentRecord[]> = {
  AXA: [],
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
