# Journal — magneta-risk-x402

## 2026-10-20 — Palier gratuit, skill d'agent, paquet client, vitrines
- Licence MIT ajoutée (décision Dominique, titulaire « Magneta Finance ») : racine + paquet npm, champ `license` MIT
- Palier gratuit : `GET /v1/flags/:chainId/:address` + outil MCP `contract_quick_flags` (bytecode seul, partialScore, 30 req/min/IP, 429) ; `analyze.ts` refactorisé en helpers partagés, rapport payant inchangé ; 22 tests
- Skill d'agent `skills/magneta-contract-risk/SKILL.md` (format skills.sh, calqué sur la skill x402 de Coinbase) : quand utiliser, 3 chemins d'appel, lecture du score, erreurs jamais facturées
- Paquet `packages/contract-risk-client` (`@magneta-finance/contract-risk` 0.1.0, non publié : npm non connecté) : client typé x402 + adaptateurs LangChain.js, AI SDK, function calling ; 5 tests
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
