# Journal — magneta-risk-x402

## 2026-10-28 — ClawHub 0.1.1 publiée mais « suspicious » → plafonds alignés sur le prix
- ClawHub a débloqué la 0.1.1 (correctifs ClawScan #126 / ClawHub #4121) ; revue de sécurité « suspicious » (SkillSpector 46/100, MEDIUM) : exemples plafonnés à 0,05 $ alors que l'utilisateur approuve 0,01 $, paquet compagnon non épinglé
- Corrigé : plafond exact 0,01 $ (HTTP `maxAmountPerPayment`, MCP `onPaymentRequested` limité à USDC sur Base ≤ 10 000), schéma Base seul, `@magnetafinance/contract-risk@0.1.2` épinglé ; les 4 exemples compilent contre les types réels
- Même défaut corrigé dans le client (défaut 0,01 $, v0.1.3) et le plugin ElizaOS (défaut 0,01, v0.1.2) ; skill ClawHub v0.1.2
- À republier par Dominique : ClawHub 0.1.2, npm client 0.1.3, plugin 0.1.2 ; CLI clawhub 0.24.1 disponible

## 2026-10-25 — Vérifications J+1
- ClawHub 0.1.1 toujours invisible à +17 h 45 (seule 0.1.0 publique, 89 téléchargements, 0 installation) → relance support à faire
- Bazaar : contract risk score 1er, smart contract risk 3e, smart contract security 7e ; absent des 5 requêtes « token/rug » ; compteurs inchangés (HTTP 10 appels/4 payeurs, MCP 8/2)
- Effet du fil X à J+1 : 0 étoile, 2 visites GitHub/14 j (1 avant), npm inchangé, aucun nouveau paiement (solde 0,28 USDC)

## 2026-10-24 — 2e session : prix 0,01 $, erreurs documentées, achat d'entretien, images X
- Décision Dominique : prix 0,02 → 0,01 $ (médiane mesurée de la catégorie : 0,01 $, 22 concurrents sur 41 moins chers) ; versions service/MCP 0.1.2, client 0.1.2, plugin 0.1.1, ClawHub 0.1.1 (republications à faire)
- Erreurs documentées (exigence de curation Coinbase) : `/openapi.json` (OpenAPI 3.1 : 400, 402, 422, 429, 502, 504), tableau README, description Bazaar 450 car. (≤ 500), description de l'outil MCP payant
- Achat d'entretien 2×/mois (le Bazaar retire une fiche après 30 j sans règlement) : `scripts/keepalive-purchase.sh` + minuteur utilisateur `deploy/keepalive/` ; installation refusée à l'agent (persistance) → à installer par Dominique
- Fil X à 8 messages (4 pièges) + 3 images 1600×900 avec textes alternatifs dans `docs/launch/images/`
- Déployé + minuteur installé par Dominique ; 1er passage manuel du script d'entretien OK (tx 0x3031fb98…) + achat MCP (tx 0x1d5ac458…), 0,01 USDC chacun vérifiés on-chain ; fiche relue en 1 min (prix 10000, nouvelle description)
- Recherche juste après : « contract risk score » 1er, « smart contract risk » 3e, « smart contract security » 6e (nouveau) ; absent de token rug check, honeypot, token risk report, rug pull check, token security check (qualité recalculée sous 6 h)
- Republiés par Dominique : npm client 0.1.2 + plugin 0.1.1 (vérifiés), ClawHub 0.1.1 soumise 22:16 UTC (analyse statique propre, ClawScan en file d'attente à +1 h 40) ; fil X publié
- Compteurs de départ après X : 0 étoile, 1 visite GitHub/14 j, 19 téléchargements npm/sem., Bazaar HTTP 4 payeurs, MCP 2
- Recherche classement : documentation officielle vérifiée (pertinence + qualité 30 j recalculée toutes les 6 h ; curation éditoriale agentic.market) ; validateur officiel 26/26

## 2026-10-24 — Bazaar : indexé mais introuvable en recherche → nom, mots-clés, icône
- Mesuré : `/discovery/search` (4 requêtes : smart contract risk, contract risk score, token rug check, honeypot) → service ABSENT ; concurrents en tête portent `serviceName` + `tags` + `iconUrl`, notre 402 HTTP n'en avait aucun
- Ajout `SERVICE_NAME`, 5 `SERVICE_TAGS`, `iconUrl` sur la route HTTP et l'outil MCP ; route `/icon.png` (logo M recadré 256 px, sans filigrane Gemini) ; `image` dans le fichier ERC-8004 ; test des 3 champs contre les assainisseurs du SDK (+ jumeaux négatifs)
- Déployé par Dominique ; achats de rafraîchissement HTTP (tx 0x173e3dc4…) + MCP (tx 0xc0c0beee…) ; fiche HTTP relue ~16:16 UTC avec nom, mots-clés, icône (rehébergée Cloudinary) ; fiche MCP relue SANS ces champs
- Description réécrite (sécurité de contrat, risque de jeton, leviers de rug pull ; PAS « honeypot » : pas de simulation de revente) + schéma JSON du rapport publié dans les 2 déclarations (27 tests)
- Recherche remesurée : « contract risk score » 1er, « smart contract risk » 2e ; toujours absent de « token rug check », « honeypot token check », « smart contract security », « token risk report »

## 2026-10-23 — Identité ERC-8004, plugin ElizaOS, skill ClawHub, textes de lancement
- Fichier d'identité ERC-8004 + route `/.well-known/agent-registration.json` ; registre Base `0x8004A169…a432` vérifié on-chain (AgentIdentity 2.0.0) ; script `erc8004-register.ts` (calldata + `--check`) ; NON déployé (déploiement prod refusé à l'agent) ; inscription à signer par Dominique
- Plugin `@magnetafinance/plugin-contract-risk` 0.1.0 (ElizaOS core 1.7.2, 2 actions, plafond par paiement, 11 tests) ; registre ElizaOS FERMÉ aux tiers depuis août 2026 → publication npm seulement
- Copie ClawHub de la skill (`skills/clawhub/`, frontmatter `metadata.openclaw`, approbation humaine avant paiement) ; essai à blanc du CLI 0.23.3 OK ; ClawHub impose MIT-0
- Client 0.1.1 (description npm nettoyée, README licence MIT) et plugin ElizaOS 0.1.0 PUBLIÉS sur npm par Dominique ; installation propre depuis npm + chargement vérifiés (PIÈGE : session `npm login` expirée → 404 au PUT, pas 401)
- Skill PUBLIÉE sur ClawHub par Dominique (CLI 0.20 → 0.23.3 : l'ancienne connexion par redirection est fermée) : https://clawhub.ai/Bosacks/skills/magneta-contract-risk, publique après 4 min, modération `clean` (revue LLM), licence MIT-0
- Fil X (7 messages) + Show HN rédigés dans `docs/launch/`
- Identité ERC-8004 FRAPPÉE par Dominique : agentId 1017790, propriétaire 0xc7c8…821e, bloc 52985516, tx 0xacb66b83… ; agentURI saisi = JSON brut au lieu de l'URL → corrigé par `setAgentURI` (tx 0x0f0fd0d7…, vérifié : tokenURI = URL https) ; `registrations` rempli dans le fichier
- README : rsync de déploiement exclut désormais `.env.local`

## 2026-10-21 — Solana comme 2e réseau de paiement
- `SOLANA_PAY_TO` (adresse de Dominique 8chhny9…Pi72) → `ExactSvmScheme` enregistré sur `solana:5eykt4…` ; route HTTP et outil MCP acceptent USDC Base OU USDC Solana, même facilitateur Coinbase (payeur de frais Solana fourni par CDP)
- Déployé ; 402 public vérifié avec 2 `accepts` ; `scripts/buy-once-svm.ts` + dépendance exacte `@solana/kit` 5.5.1
- Acheteur de test Solana AnyZQa2pDfcW2MC7xLgDQEFQLDEAW8J2MBVetnjU5yLN financé par Dominique (1,51 USDC) ; compte USDC créé sur l'adresse de réception
- 22-10 10:31 UTC : 1er achat réel en USDC Solana par l'URL publique, signature AuCoz3ba…, règlement par Coinbase (payeur de frais), Bazaar « processing »
- Constat Bazaar (compteurs 30 j) : 3 payeurs distincts HTTP, 2 MCP → au moins un payeur externe ; solde 0,18 USDC = 9 règlements dont 8 de mes tests

## 2026-10-20 — Palier gratuit, skill d'agent, paquet client, vitrines
- Paquet renommé `@magnetafinance/contract-risk` (le compte npm est `magnetafinance`, pas d'organisation) ; PUBLIÉ 0.1.0 le 20-10 19:40 UTC par Dominique (npm exige une passkey : créée via Chrome + Gestionnaire Google, `npm config set browser google-chrome` + navigateur système = Chrome)
- Licence MIT ajoutée (décision Dominique, titulaire « Magneta Finance ») : racine + paquet npm, champ `license` MIT
- Palier gratuit : `GET /v1/flags/:chainId/:address` + outil MCP `contract_quick_flags` (bytecode seul, partialScore, 30 req/min/IP, 429) ; `analyze.ts` refactorisé en helpers partagés, rapport payant inchangé ; 22 tests
- Skill d'agent `skills/magneta-contract-risk/SKILL.md` (format skills.sh, calqué sur la skill x402 de Coinbase) : quand utiliser, 3 chemins d'appel, lecture du score, erreurs jamais facturées
- Paquet `packages/contract-risk-client` (`@magnetafinance/contract-risk` 0.1.0, non publié : npm non connecté) : client typé x402 + adaptateurs LangChain.js, AI SDK, function calling ; 5 tests
- Recherche vitrines : Base = formulaire Google (repo base/web archivé 03-2026) ; awesome-x402 = xpaysh (292 ★, 856 PR ouvertes) section Security & Audits ; curation Coinbase = éditoriale sans formulaire ; skills.sh = classement par installations, pas de soumission
- Déployé ; paiements de rafraîchissement Bazaar après changement des descriptions ; PR awesome-x402 ouverte : https://github.com/xpaysh/awesome-x402/pull/1923

## 2026-10-17 — 22:40 — Glama réclamée, qualité des outils (v0.1.1)
- Fiche Glama importée seule depuis le registre officiel (`glama.ai/mcp/connectors/io.github.Bosacks/magneta-contract-risk`), propriété vérifiée par Dominique via GitHub ; statut Healthy, TDQS 3,7/5
- D'après le détail TDQS : descriptions d'outils réécrites (quand utiliser, flux de paiement x402, pas de facturation sur échec, cache), annotations MCP readOnly/idempotent, 3e outil gratuit `scoring_rubric` (grille exportée de `score.ts`), description Bazaar enrichie (350 car.)
- Déployé, registre MCP republié en 0.1.1, dépôt poussé ; paiements de rafraîchissement Bazaar (HTTP + MCP)
- Concurrents repérés sur Glama (x402 aussi) : CYRE Guardian, hostdefi/trustdex, Tollbooth Swap, verdix, Watchdog, token-safety

## 2026-10-16 — 02:05 — Promotion gratuite : dépôt public + registre MCP
- Dépôt GitHub public créé : https://github.com/Bosacks/magneta-risk-x402 (aucun secret, `.env.local` et logs ignorés)
- Publié au registre MCP officiel : `io.github.Bosacks/magneta-contract-risk` v0.1.0, remote streamable-http https://x402.magneta.finance/mcp (auth GitHub, pas de DNS ; description ≤ 100 caractères)
- Page écosystème x402.org : n'existe plus (404) ; la Fondation ne liste que ses membres payants → canal abandonné
- Restent manuels : Discord x402/CDP, X, annuaires Smithery/Glama/PulseMCP

## 2026-10-16 — 01:45 — Fiche MCP : exemple d'arguments ajouté
- Cause du « processing » sans fin : le Bazaar appelle l'outil MCP avec `info.input.example` pour obtenir le 402 ; notre déclaration n'avait ni `example` ni `transport`
- `src/discovery.ts` : `example { chainId: 8453, address: USDC Base }` + `transport: "streamable-http"` ; test mis à jour (18/18)
- Redéployé, paiement MCP de republication effectué ; fiche MCP VISIBLE au catalogue (indexée à 01:39:57 UTC, en < 2 min)

## 2026-10-16 — 01:40 — 20 chaînes analysées (était 4)
- Table `src/chains.ts` : 16 mainnets EVM + 4 testnets ; Blockscout optionnel (BNB, Sonic, Mantle, Avalanche via Sourcify seul) ; zkSync Era exclu (EraVM)
- Polygon : `polygon-rpc.com` mort → `polygon-bor-rpc.publicnode.com` ; explorateur Mantle en 502 → retiré
- aderyn : remappages compilateur (Blockscout/Sourcify) écrits dans `remappings.txt` (Blast/OP-stack passaient en échec) ; lignes SPDX dupliquées des sources aplaties neutralisées (BNB)
- Fumée : les 20 chaînes répondent sur un USDC/USDB réel, 0,5 à 8 s ; 18 tests unitaires
- Déployé sur le VPS ; paiement de rafraîchissement Bazaar à faire pour republier l'énumération des chaînes

## 2026-10-16 — 01:12 — EN PRODUCTION sur Base mainnet, indexé au Bazaar
- Bascule `X402_NETWORK=eip155:8453`, `PAY_TO=0xc7c8…821e` (adresse choisie par Dominique), redémarrage
- Achats réels publics : HTTP tx 0x98d7a84e… (bloc 52661871) et MCP tx 0xc97bdb74…, 0,02 USDC chacun vers 0xc7c8…821e, réglés par Coinbase
- Validation Coinbase : `index.active: true` ; fiche Bazaar visible pour 0xc7c8…821e (route `/v1/risk/:chainId/:address`, mainnet) ; outil MCP en « processing »
- Piège : `buy-once-mcp` doit recevoir `X402_NETWORK=eip155:8453` sinon le client ne connaît que le testnet

## 2026-10-16 — 01:08 — Flux mainnet PROUVÉ (essai local)
- Nouvelle clé acheteur dédiée (0xc964…5749, clé compromise 0x6206 retirée du prototype) ; Dominique y a envoyé 1,99 USDC sur Base mainnet
- Règle apprise : le facilitateur refuse `self_send_not_allowed` (acheteur = vendeur) → essai vers le faucet 0x9453…18BB
- 1 achat réel à 0,02 USDC sur Base mainnet via Coinbase CDP : tx 0x94f89d4e…, bloc 52661768, soumis par un signataire Coinbase, nonce acheteur 0, 1,8 s
- Hooks de cycle de vie ajoutés au serveur (verify-failure, settled, settle-failure), déployés sur le VPS
- Reste : adresse de réception mainnet à choisir par Dominique, puis `X402_NETWORK=eip155:8453` + `PAY_TO` sur le VPS ; fiche Bazaar testnet toujours absente (veille)

## 2026-10-16 — 00:20 — Mise en ligne x402.magneta.finance
- DNS A `x402` ajouté par Dominique (Namecheap), vhost Caddy ajouté au fichier live (backup Caddyfile.bak-20261016-001750), certificat Let's Encrypt obtenu
- Service démarré sous systemd avec le facilitateur Coinbase CDP (clés copiées par Dominique)
- Fix découverte Bazaar : `trust proxy` loopback (URL de ressource en https derrière Caddy) + `PUBLIC_URL` comme URL de ressource MCP (CDP refusait `mcp://`)
- Achats réels par l'URL publique (HTTP + MCP) : règlés, réponses Bazaar « processing »
- Validation Coinbase `POST /platform/v2/x402/validate` sur la route HTTP : `valid: true`, simulation `accepted`, routeTemplate `/v1/risk/:chainId/:address` reconnu ; fiche merchant encore vide à 00:52 UTC (indexation annoncée ≤ 15 min, veille en cours)
- Reste : confirmer la fiche Bazaar, puis point 3 = bascule `X402_NETWORK=eip155:8453` + PAY_TO mainnet

## 2026-10-15
- Création du service « Magneta Contract Risk » : rapport de risque par adresse de contrat (Base, Base Sepolia, Ethereum, Arbitrum), vendu 0,02 $ USDC via x402, route HTTP + outil MCP
- Moteur `src/risk/` : proxy, owner/paused, sélecteurs à risque, opcodes, source Blockscout → repli Sourcify, aderyn, score 0-100 documenté ; 16 tests unitaires
- Achats réels vérifiés on-chain sur Base Sepolia via le facilitateur Coinbase CDP (HTTP et MCP)
- Fix Bazaar : `chainId` en paramètre de chemin déclaré string (CDP rejetait « invalid discovery configuration ») ; test `test/discovery.test.ts`
- Déploiement VPS `/srv/magneta/risk-x402` : deps prod installées, unité systemd installée (non démarrée), `.env.local` sans les clés CDP
- Reste : DNS A `x402.magneta.finance`, clés CDP sur le VPS, vhost Caddy, démarrage, paiement test public (indexation Bazaar), puis bascule mainnet
