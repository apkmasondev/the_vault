# THE VAULT — plan wdrożenia produkcyjnego

> Repozytorium docelowe: `apkmasondev/the_vault`  
> Publikacja: GitHub Pages przez GitHub Actions  
> Typ projektu: single-page cinematic WebGL experience  
> Priorytet nr 1: **płynność na mobile i desktopie**  
> Priorytet nr 2: spójność film → WebGL bez widocznych cięć  
> Priorytet nr 3: dopracowane UI, poprawny kod, responsywność, dostępność i stabilny deploy

---

## 0. Instrukcja dla agenta wdrażającego

Nie traktuj tego planu bezkrytycznie.

Przed implementacją:
1. sprawdź faktyczne pliki wideo, ich długość, FPS, rozdzielczość i ostatnie klatki;
2. sprawdź aktualne wersje zależności i wymagania Vite / GitHub Pages;
3. nie zakładaj, że rozwiązanie działa poprawnie tylko dlatego, że się kompiluje;
4. testuj zachowanie na małym ekranie, dotyku, wolniejszym urządzeniu i po produkcyjnym buildzie;
5. jeśli któryś parametr z planu powoduje gorszą płynność lub nie pasuje do faktycznych materiałów, popraw go i opisz zmianę;
6. nie dodawaj ciężkich bibliotek, jeśli dany efekt da się osiągnąć prostszym kodem;
7. nie implementuj efektu wyłącznie dlatego, że jest opisany — najpierw oceń, czy wizualnie i wydajnościowo poprawia projekt;
8. projekt ma być wolny od błędów w konsoli, warningów Reacta, wycieków WebGL, martwego kodu i nieużywanych assetów;
9. nie dodawaj przypadkowych sekcji, kart, navbarów ani typowego layoutu landing page;
10. traktuj THE VAULT jako jedno spójne doświadczenie filmowe.

---

# 1. Cel projektu

THE VAULT ma wyglądać jak krótka, interaktywna scena z filmu sci-fi / thrillera technologicznego.

Użytkownik:
1. trafia przed ogromne mechaniczne wrota;
2. autoryzuje dostęp;
3. scrollowaniem uruchamia i odblokowuje mechanizm;
4. otwiera vault;
5. odkrywa, że to nie jest zwykły sejf;
6. widzi nieznany artefakt generowany w WebGL;
7. kończy doświadczenie komunikatem `CONTAINMENT FAILURE`.

Projekt **nie jest portfolio**, nie jest prezentacją firmy i nie powinien być przeładowany brandingiem.

`ApkMason.dev` może pojawić się wyłącznie bardzo dyskretnie w finale / stopce doświadczenia.

---

# 2. Materiały wejściowe

Zakładamy dwa natywne filmy:

- `vault-unlock-source.mp4`
  - 1280×720
  - 24 FPS
  - około 10 s
  - aktywacja + praca mechanizmu + odblokowanie;
- `vault-opening-source.mp4`
  - 1280×720
  - 24 FPS
  - około 10 s
  - ciężkie otwieranie wrót + światło + mgła.

## Ważna decyzja

**Nie generować trzeciego filmu.**

Finał ma zostać wykonany proceduralnie w WebGL.

Drugi film nie powinien być eksponowany aż do jego absolutnie ostatniej klatki, ponieważ pod koniec generator zaczyna ujawniać dodatkowy mechanizm w głębi.

Punkt końcowy filmu 2 ma być konfigurowalny.

Wstępna wartość:

```ts
const VIDEO_2_REVEAL_CUTOFF = 8.6;
```

Po testach wizualnych należy dobrać zakres około `8.2–8.8 s`, tak aby:
- wrota były już wyraźnie otwarte,
- światło i mgła były mocne,
- dodatkowe wnętrze nie przejmowało uwagi,
- przejście do artefaktu WebGL wyglądało naturalnie.

---

# 3. Główna zasada techniczna

Nie budować całego sejfu jako modelu 3D.

Nie jest to potrzebne.

Warstwy powinny wyglądać tak:

```text
DOM UI
↑
transparent WebGL canvas
↑
video / paused video frame / poster
↑
dark background
```

Film zapewnia fotorealistyczną konstrukcję sejfu.

WebGL odpowiada wyłącznie za:
- pył;
- haze / fog;
- światło;
- subtelne zniekształcenia;
- cząsteczki;
- reveal artefaktu;
- reakcję artefaktu na użytkownika;
- finałową falę energii.

Dzięki temu:
- nie trzeba dopasowywać modelu 3D do wygenerowanego filmu;
- zużycie GPU jest znacznie mniejsze;
- ciągłość wizualna jest łatwiejsza;
- projekt jest realnie wykonalny na telefonach.

---

# 4. Technologia

## Rekomendowany stack

- Vite
- React
- TypeScript
- Three.js
- CSS / CSS Modules lub jedna uporządkowana warstwa stylów z CSS variables
- bez backendu
- bez routera, jeśli projekt pozostaje jedną sceną
- bez biblioteki smooth-scroll
- bez ciężkiego systemu UI
- bez niepotrzebnego state managementu

## Dlaczego React + bezpośrednie Three.js

React obsługuje:
- UI;
- loader;
- HUD;
- przyciski;
- audio toggle;
- accessibility;
- lifecycle.

Three.js powinno działać w oddzielnym, imperatywnym module.

**Nie przepuszczać każdej klatki animacji przez React state.**

Wartości animacyjne:
- scroll progress;
- current frame;
- particle time;
- mouse parallax;
- shader uniforms;

mają być przechowywane w zwykłych obiektach / refs i aktualizowane przez `requestAnimationFrame`.

React powinien renderować ponownie tylko wtedy, gdy zmienia się realny stan UI, np.:
- `loading → ready`;
- `locked → authorized`;
- `muted → unmuted`;
- `experience → completed`.

---

# 5. Struktura projektu

```text
the_vault/
├─ .github/
│  └─ workflows/
│     ├─ deploy.yml
│     └─ ci.yml
│
├─ public/
│  ├─ favicon.svg
│  ├─ robots.txt
│  ├─ media/
│  │  ├─ vault-unlock-720-gop1.mp4
│  │  ├─ vault-unlock-540-gop1.mp4
│  │  ├─ vault-opening-720-gop1.mp4
│  │  ├─ vault-opening-540-gop1.mp4
│  │  ├─ vault-poster.webp
│  │  ├─ vault-opening-transition.webp
│  │  └─ soundtrack.mp3
│  └─ social/
│     └─ og-vault.jpg
│
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  └─ constants.ts
│  │
│  ├─ components/
│  │  ├─ Experience.tsx
│  │  ├─ EntryGate.tsx
│  │  ├─ Hud.tsx
│  │  ├─ AudioToggle.tsx
│  │  ├─ LoadingScreen.tsx
│  │  └─ ReducedMotionFallback.tsx
│  │
│  ├─ media/
│  │  ├─ VideoScrubber.ts
│  │  ├─ videoSources.ts
│  │  └─ mediaPreloader.ts
│  │
│  ├─ webgl/
│  │  ├─ VaultRenderer.ts
│  │  ├─ Artifact.ts
│  │  ├─ ParticleField.ts
│  │  ├─ FogOverlay.ts
│  │  ├─ DistortionPass.ts
│  │  ├─ shaders/
│  │  │  ├─ artifact.vert.glsl
│  │  │  ├─ artifact.frag.glsl
│  │  │  ├─ fog.vert.glsl
│  │  │  └─ fog.frag.glsl
│  │  └─ quality.ts
│  │
│  ├─ audio/
│  │  └─ AudioEngine.ts
│  │
│  ├─ hooks/
│  │  ├─ useReducedMotion.ts
│  │  ├─ useVisibility.ts
│  │  └─ usePointer.ts
│  │
│  ├─ utils/
│  │  ├─ clamp.ts
│  │  ├─ lerp.ts
│  │  ├─ mapRange.ts
│  │  └─ deviceTier.ts
│  │
│  ├─ styles/
│  │  ├─ globals.css
│  │  ├─ tokens.css
│  │  └─ experience.css
│  │
│  ├─ main.tsx
│  └─ vite-env.d.ts
│
├─ tests/
│  ├─ progress.test.ts
│  └─ mapRange.test.ts
│
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ eslint.config.js
├─ README.md
└─ PLAN.md
```

Struktura może zostać uproszczona, jeśli agent uzna, że część plików byłaby sztucznym rozdrobnieniem.

---

# 6. Storyboard całego doświadczenia

## Stan 0 — LOADING

Ekran:
- prawie całkowicie czarny;
- delikatny zarys pierwszej klatki vaultu;
- mały loader;
- zero intensywnych animacji.

Copy:

```text
THE VAULT

INITIALIZING CONTAINMENT SYSTEM
```

Opcjonalny mały progres:
`00–100%`

Nie udawać fałszywego ładowania.

Progres powinien odpowiadać realnym krytycznym assetom:
- poster;
- JS;
- WebGL init;
- metadata filmu 1.

Nie czekać na pełne pobranie całej drugiej sceny, żeby pokazać interfejs.

---

# 7. Entry Gate — autoryzacja

Po gotowości:

```text
THE VAULT
CONTAINMENT SYSTEM V-07

HOLD TO AUTHORIZE
```

Centralnie prosty okrągły kontroler.

## Zachowanie

Desktop:
- pointer down;
- przytrzymanie około `800–1000 ms`.

Mobile:
- touch / pointer down;
- ten sam mechanizm.

Keyboard:
- `Space` lub `Enter`.

Wypełnienie pierścienia:
- płynne;
- nie liniowe w wyglądzie;
- bez jaskrawego neonu.

Po sukcesie:

```text
ACCESS GRANTED
```

krótko, około `700–1000 ms`.

## Bardzo ważne

Ta interakcja jest jednocześnie pierwszym user gesture.

W tym momencie:
- wznowić `AudioContext`, jeśli istnieje;
- uruchomić soundtrack, jeśli dźwięk jest włączony;
- rozpocząć preload drugiego filmu;
- umożliwić scroll experience.

Dodać małą alternatywę:

```text
ENTER MUTED
```

Nie blokować użytkownika, który nie chce dźwięku.

---

# 8. Scroll architecture

Po autoryzacji cały projekt jest jedną sticky sceną.

```css
.experience {
  position: relative;
  min-height: var(--timeline-height);
}

.stage {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100dvh;
  overflow: clip;
}
```

## Wysokość timeline

Startowe wartości:

Desktop:
```css
--timeline-height: 950vh;
```

Mobile:
```css
--timeline-height: 1000svh;
```

Nie traktować tych wartości jako świętych.

Należy sprawdzić:
- szybkość wheel;
- touch momentum;
- liczbę klatek filmu;
- zachowanie Safari i Chrome Android.

Celem jest, aby przewijanie jednego filmu nie wymagało ani mikroskopijnych ruchów, ani przesadnie długiego scrollowania.

---

# 9. Normalizacja scrolla

Nie używać biblioteki Lenis / locomotive / własnego fake scrolla.

Używać natywnego scrolla przeglądarki.

Na `scroll`:
- tylko zapisać aktualną pozycję;
- nie wykonywać ciężkich obliczeń;
- listener `{ passive: true }`.

W `requestAnimationFrame`:

```ts
targetProgress = clamp(
  (scrollY - experienceTop) /
  (experienceHeight - viewportHeight),
  0,
  1
);
```

Następnie osobno:

```ts
displayProgress = damp(
  displayProgress,
  targetProgress,
  tau,
  deltaTime
);
```

Startowo:

```ts
const SCROLL_DAMPING_MS = 130;
```

Zakres do testów:
`110–160 ms`.

Nie wolno zrobić efektu, w którym strona „pływa” pół sekundy za użytkownikiem.

---

# 10. Timeline narracyjny

Startowa mapa:

| Progress | Etap |
|---|---|
| `0.00–0.06` | wejście po autoryzacji |
| `0.06–0.48` | Film 1 — unlock |
| `0.48–0.56` | zatrzymanie / komunikat |
| `0.56–0.84` | Film 2 — opening |
| `0.84–0.94` | WebGL artifact reveal |
| `0.94–0.985` | interakcja / unstable |
| `0.985–1.00` | containment failure / finał |

Mapa ma znajdować się w jednym pliku konfiguracyjnym.

Przykład:

```ts
export const TIMELINE = {
  video1Start: 0.06,
  video1End: 0.48,
  warningStart: 0.48,
  warningEnd: 0.56,
  video2Start: 0.56,
  video2End: 0.84,
  revealStart: 0.84,
  revealEnd: 0.94,
  failureStart: 0.985,
} as const;
```

Nie rozsypywać magic numbers po komponentach.

---

# 11. Film 1 — UNLOCK

Zakres:
`progress 0.06 → 0.48`

Mapowanie:

```ts
videoTime = mapRange(
  progress,
  TIMELINE.video1Start,
  TIMELINE.video1End,
  0,
  video1.duration
);
```

Film:
- zawsze `muted`;
- `playsInline`;
- `pause()`;
- nie odtwarzać zwykłym `play()`;
- sterowanie przez `currentTime`.

Film ma być widoczny od pierwszej klatki.

WebGL:
- bardzo delikatny pył;
- ledwo widoczna mgła;
- mały parallax;
- subtelny vignette / haze.

UI minimalne.

Przykładowe teksty, które mogą pojawić się na chwilę:

```text
MECHANICAL LOCK
SEQUENCE ACTIVE
```

oraz później:

```text
LOCK STATUS
DISENGAGED
```

Nie wyświetlać kilku tekstów jednocześnie.

---

# 12. Interlude po Filmie 1

Film 1 kończy się i zostaje zatrzymany na ostatniej klatce.

Przez około `0.48–0.56` timeline:

- brak dalszego ruchu mechanizmu;
- delikatne wyciszenie soundtracku;
- niewielki wzrost haze;
- ledwo widoczny camera rumble;
- światła pozostają aktywne.

Copy:

```text
CONTAINMENT RELEASED
```

po chwili:

```text
DO NOT OPEN.
```

`DO NOT OPEN.` powinno mieć dużo pustej przestrzeni.

To ma być moment ciszy, nie cyberpunkowy alert.

---

# 13. Film 2 — OPENING

Zakres:
`0.56 → 0.84`.

Mapowanie do czasu:

```ts
const endTime = Math.min(
  VIDEO_2_REVEAL_CUTOFF,
  video2.duration
);
```

Film 2 nie musi dojść do `10.0 s`.

Domyślny cutoff:
`8.6 s`.

Podczas otwierania:
- zwiększać haze;
- zwiększać cząsteczki w świetle;
- bardzo subtelnie podnosić exposure WebGL overlay;
- audio może dostać niski rumble.

Nie dodawać artefaktu przed samym końcem.

---

# 14. Przejście Film 2 → WebGL

To jest najważniejsze przejście projektu.

## Zasada

Film zostaje zatrzymany na dobranej klatce około `8.6 s`.

Nie zmieniamy tła.

Nadal na ekranie znajduje się dokładnie ten sam `<video>`.

WebGL zaczyna stopniowo zasłaniać / przejmować wnętrze:

1. haze zwiększa opacity;
2. jasny środek dostaje miękką maskę;
3. pojawia się delikatny radial distortion;
4. pojawia się halo;
5. artefakt ma opacity `0 → 1`;
6. tło wewnątrz zostaje optycznie przygaszone.

Dzięki temu użytkownik nie widzi:
`koniec filmu → nowa scena`.

Ma widzieć:
`film zmienia się w interaktywną rzeczywistość`.

---

# 15. WebGL — renderer

Renderer:

```ts
new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: false,
  powerPreference: 'high-performance',
});
```

## Antialias

Na starcie `false`.

W tym projekcie:
- obiekt jest świetlisty;
- tło jest filmem;
- particles i haze nie wymagają MSAA.

Jeżeli krawędzie artefaktu wyglądają źle, poprawić shader / geometrię zamiast od razu zwiększać koszt całego renderera.

## Pixel ratio

Nie używać bezwarunkowo:

```ts
renderer.setPixelRatio(window.devicePixelRatio);
```

Zamiast tego:

Desktop high:
```ts
Math.min(devicePixelRatio, 1.5)
```

Mobile:
```ts
Math.min(devicePixelRatio, 1.25)
```

Low-performance:
```ts
1.0
```

---

# 16. Adaptive quality

Wprowadzić trzy poziomy:

```ts
type QualityTier = 'high' | 'medium' | 'low';
```

## HIGH

- DPR max `1.5`;
- particles: około `900–1300`;
- inner stars: około `500`;
- pełny distortion;
- pełny fog shader;
- subtelny bloom-like halo.

## MEDIUM

- DPR max `1.25`;
- particles: około `500–750`;
- stars: około `300`;
- mniejsza liczba noise octaves;
- słabszy distortion.

## LOW

- DPR `1.0`;
- particles: około `220–350`;
- stars: około `120–180`;
- brak kosztownego postprocessingu;
- haze jako prosty shader / CSS gradient;
- brak zbędnych efektów ekranu.

## Dynamiczna degradacja

Mierzyć moving average czasu klatki.

Jeżeli przez kilka sekund:
- średnia wyraźnie przekracza budżet 60 FPS;
- albo klatki regularnie spadają poniżej ~45 FPS;

obniżyć tier o jeden poziom.

Nie podnosić jakości agresywnie ponownie co kilka sekund.

Stabilność jest ważniejsza niż skacząca jakość.

---

# 17. Artefakt

Artefakt ma być centralną, unoszącą się kulą / osobliwością.

Nie powinien wyglądać jak:
- planeta Ziemia;
- typowa niebieska kula energii;
- kula z przypadkowym neonem;
- logo AI.

Ma wyglądać jak coś:
- fizycznie niemożliwego;
- bardzo starego;
- niebezpiecznego;
- pięknego.

## Budowa

### Core
`IcosahedronGeometry` z odpowiednią liczbą subdivisions.

Shader:
- procedural noise;
- powolna rotacja;
- niejednorodna emisja;
- subtle displacement.

### Fresnel shell
Druga, minimalnie większa geometria:
- additive blending;
- fresnel na krawędziach;
- bardzo niska opacity.

### Inner stars
Mały `Points` system wewnątrz kuli:
- wolny obrót;
- nierówny rozkład;
- brak tekstur z internetu.

### Halo
Sprite / mesh z radial gradientem.

### Floating debris
Opcjonalnie kilka małych elementów.
Jeżeli wyglądają sztucznie lub kosztują za dużo — usunąć.

---

# 18. Reakcja artefaktu na użytkownika

Po revealu użytkownik ma poczuć, że artefakt reaguje.

## Desktop

Pointer normalized:
`[-1, 1]`.

Wpływ:
- rotacja artefaktu maksymalnie około `2–3°`;
- particles lekko odchylają się w przeciwną stronę;
- halo przesuwa środek o kilka pikseli;
- shader distortion reaguje subtelnie.

Nie robić efektu „kula przyklejona do kursora”.

## Mobile

Nie wymagać żyroskopu.

Domyślnie:
- touch position;
- pointer move podczas dotyku;
- bardzo wolny autonomous drift, gdy użytkownik nie dotyka ekranu.

DeviceOrientation może być eksperymentalną opcją dopiero po testach i tylko po świadomym permission flow.
Nie jest potrzebne do MVP.

---

# 19. Click / tap na artefakt

Po revealu kliknięcie / tap:

1. shader pulse;
2. cząsteczki odsuwają się od środka;
3. ekran dostaje jedną falę radial distortion;
4. soundtrack / SFX dostaje niski impact;
5. artefakt przez chwilę rozjaśnia się;
6. wraca do stanu niestabilnego.

Nie wykonywać eksplozji.

Nie spamować efektem przy szybkim klikaniu.

Cooldown około `1.5–2 s`.

---

# 20. Finał

W ostatnim fragmencie timeline:

pojawiają się kolejno:

```text
OBJECT: UNKNOWN
ORIGIN: UNKNOWN
STABILITY: 03%
```

Nie muszą być widoczne jednocześnie.

Następnie:
- obraz delikatnie pulsuje;
- haze staje się niestabilny;
- artefakt zatrzymuje się prawie całkowicie.

Ostatni komunikat:

```text
CONTAINMENT FAILURE
```

Krótka fala distortion.

Fade to black.

Po chwili:

```text
THE VAULT

AN INTERACTIVE WEBGL EXPERIMENT
```

Drobny podpis:

```text
ApkMason.dev
```

Opcjonalne akcje:

```text
REPLAY
SOUND ON/OFF
```

Nie przewijać automatycznie strony na początek bez zgody użytkownika.

`REPLAY`:
- zatrzymuje audio;
- resetuje progress;
- scrolluje na początek experience;
- resetuje WebGL uniforms;
- resetuje video times;
- może ponownie wystartować bez drugiego hold, jeśli użytkownik już autoryzował sesję.

---

# 21. Video scrubbing — klucz do płynności

## Format źródłowy

Nie upscalować 720p do 1080p.

Źródło pozostaje natywne:
`1280×720 / 24 FPS`.

## GOP1

Docelowe filmy scrollowane muszą być przygotowane jako all-intra / GOP1.

Przykładowa komenda desktop:

```bash
ffmpeg -i vault-unlock-source.mp4 \
  -an \
  -vf "fps=24,scale=1280:720:flags=lanczos,format=yuv420p" \
  -c:v libx264 \
  -preset slow \
  -crf 20 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  vault-unlock-720-gop1.mp4
```

Film 2 analogicznie.

## Mobile derivative

Z natywnego 720p stworzyć też:

`960×540 / 24 FPS / GOP1`.

Przykład:

```bash
ffmpeg -i vault-unlock-source.mp4 \
  -an \
  -vf "fps=24,scale=960:540:flags=lanczos,format=yuv420p" \
  -c:v libx264 \
  -preset slow \
  -crf 21 \
  -g 1 \
  -keyint_min 1 \
  -sc_threshold 0 \
  -movflags +faststart \
  vault-unlock-540-gop1.mp4
```

Nie kasować 720p.

Na telefonie 540p jest tylko wariantem wydajnościowym.

Jeśli po testach 720p działa równie płynnie na docelowych urządzeniach, można używać 720p również na mobile.

---

# 22. Dobór źródła filmu

Nie wybierać wyłącznie na podstawie szerokości CSS.

Uwzględnić:
- viewport;
- DPR;
- heurystykę urządzenia;
- `saveData`, jeśli dostępne;
- wynik pierwszych testów wydajności.

Bezpieczny start:

- desktop / tablet landscape → 720p;
- mobile portrait → 540p;
- high-end mobile można przełączyć na 720p po testach.

Źródło nie powinno zmieniać się w połowie doświadczenia.

---

# 23. Algorytm seeking

Nie ustawiać `video.currentTime` przy każdym zdarzeniu `scroll`.

W rAF wyliczać `targetTime`.

Następnie:
- ograniczyć liczbę seeków;
- nie seekować przy różnicy mniejszej niż około pół klatki;
- ograniczyć maksymalny krok.

Startowe parametry:

```ts
const VIDEO_FPS = 24;
const MIN_SEEK_DELTA = 0.5 / VIDEO_FPS;
const MAX_SEEK_STEP = 2.5 / VIDEO_FPS;
const MAX_SEEK_HZ = 30;
```

Logika:

```ts
delta = targetTime - currentRequestedTime;

if (Math.abs(delta) < MIN_SEEK_DELTA) {
  return;
}

const step = clamp(
  delta,
  -MAX_SEEK_STEP,
  MAX_SEEK_STEP
);

requestedTime += step;
video.currentTime = requestedTime;
```

Przy bardzo dużym skoku scrolla trzeba umożliwić szybsze dogonienie, ale nie zasypywać dekodera setkami seeków.

Parametry należy stroić na rzeczywistym Chrome Android i Safari iOS.

---

# 24. requestVideoFrameCallback

Jeżeli dostępne, użyć `requestVideoFrameCallback()` do:
- obserwowania faktycznie zaprezentowanej klatki;
- mierzenia, czy video nadąża;
- wykrywania opóźnień;
- synchronizacji fade między warstwami.

Musi istnieć fallback.

Nie uzależniać podstawowego działania strony wyłącznie od tej funkcji.

---

# 25. Preload mediów

## Pierwsze wejście

Natychmiast:
- preload poster;
- preload favicon;
- JS/CSS zgodnie z Vite.

Film 1:
- metadata od razu;
- po wejściu w Entry Gate rozpocząć aktywne ładowanie.

Film 2:
- na starcie `preload="none"` lub metadata;
- rozpocząć pobieranie po autoryzacji użytkownika;
- najpóźniej zanim progress zbliży się do około `0.30`.

## Nie blokować UI

Loader nie powinien czekać na soundtrack i cały Film 2.

Jeżeli Film 2 jeszcze nie jest gotowy, a użytkownik przewinie wyjątkowo szybko:
- utrzymać ostatnią klatkę filmu 1;
- pokazać subtelny status;
- nie pokazywać czarnej klatki.

---

# 26. Poster i transition frame

Wygenerować lokalnie:

## `vault-poster.webp`
Pierwsza klatka Filmu 1.

## `vault-opening-transition.webp`
Klatka Filmu 2 dokładnie z punktu, w którym WebGL przejmuje scenę.

Poster ma:
- taki sam crop jak film;
- być bardzo lekki;
- ładować się przed filmem;
- zapobiegać czarnemu flashowi podczas inicjalizacji.

---

# 27. Mobile composition

Najważniejsza zasada:

**nie używać ślepo `object-fit: cover` na filmie 16:9 w pionowym telefonie.**

Przy `cover` ogromna część sejfu zostałaby odcięta po bokach.

## Portrait mobile

Film powinien działać jak centralny cinematic stage.

Przykładowo:
- width: `110–125vw`;
- aspect ratio: `16 / 9`;
- wyśrodkowanie;
- czarne otoczenie;
- WebGL canvas nadal zajmuje całe `100dvh`.

Dzięki temu:
- cały vault pozostaje czytelny;
- WebGL fog i particles rozszerzają scenę na cały ekran;
- czarna przestrzeń nad i pod filmem wygląda zamierzenie;
- UI może wykorzystać pionową przestrzeń.

Dobrać skalę per breakpoint.

Nie przesadzać z zoomem.

---

# 28. Desktop composition

Desktop:
- stage `100dvh`;
- film maksymalnie wykorzystuje ekran;
- `object-fit: cover` może być użyty, jeśli nie ucina ważnych elementów;
- przy ekranach ultrawide preferować delikatne przycięcie boków, nie pionu.

Maksymalny zoom:
około `1.04–1.08`.

Parallax:
bardzo subtelny.

---

# 29. CSS viewport units

Stage:
```css
height: 100dvh;
```

Timeline mobile:
preferować stabilne:
```css
svh
```

Nie opierać całej logiki scrolla na zmieniającym się klasycznym `100vh` w mobilnych przeglądarkach.

Przy `resize` / `orientationchange`:
- przeliczyć dimensions;
- zaktualizować renderer;
- zaktualizować scroll geometry;
- nie resetować użytkownika.

---

# 30. UI design

Kierunek:
- brutalistyczny industrial;
- premium;
- bardzo ciemny;
- ograniczona paleta;
- minimum tekstu;
- dużo pustej przestrzeni.

## Kolory

Przykładowe tokeny:

```css
--bg: #070809;
--surface: #0d0f10;
--text: #e8e4db;
--text-muted: #85827b;
--metal: #6f7375;
--accent: #d7b77a;
--danger: #b7604f;
--line: rgba(232, 228, 219, 0.16);
```

Accent ma przypominać ciepłe światła z filmu.

Nie używać:
- jaskrawego cyan;
- fioletowego neonowego gradientu;
- typowego "AI cyberpunk".

---

# 31. Typografia

Priorytet:
- czytelność;
- techniczny charakter;
- mała liczba krojów.

Preferowane:
- system font stack lub jeden lokalnie dostarczany / legalnie używany font;
- jeśli font sieciowy — ograniczyć do maks. jednego kroju i minimalnej liczby wag.

Nie uzależniać pierwszego renderu od ciężkiego fontu.

Nagłówki:
- uppercase;
- tracking;
- niezbyt duża waga.

HUD:
- mniejszy;
- monospaced tylko tam, gdzie ma sens.

---

# 32. HUD

HUD musi być dyskretny.

Desktop:
- top-left: `V-07 / CONTAINMENT`;
- top-right: audio;
- bottom-left: status;
- bottom-right: subtelny progress marker.

Mobile:
- ograniczyć elementy;
- nie zasłaniać centralnego vaultu;
- audio toggle minimum 44×44 px target;
- tekst nie mniejszy niż komfortowy mobilny rozmiar.

HUD może znikać podczas największego revealu.

---

# 33. Audio

Filmy mają być bez audio.

Soundtrack osobno.

## Start

Audio dopiero po:
- `HOLD TO AUTHORIZE`;
- albo świadomym włączeniu sound toggle.

## Implementacja

Preferowany Web Audio API:
- `AudioContext`;
- `MediaElementAudioSourceNode`;
- `GainNode`.

Gain pozwala robić płynne fade.

## Fade

Toggle OFF:
około `250–400 ms`.

Toggle ON:
około `400–700 ms`.

Nie robić natychmiastowego urwania dźwięku.

---

# 34. Soundtrack a scroll

Soundtrack nie powinien być odtwarzany klatka po klatce według scrolla.

Użytkownik może:
- scrollować szybko;
- cofać się;
- zatrzymać się na scenie.

Dlatego audio ma być przede wszystkim ambientem.

Można zmieniać:
- gain;
- low-pass;
- intensywność;
- dodatkowy rumble;

na podstawie progressu, ale nie seekować agresywnie głównego pliku audio przy każdym scrollu.

---

# 35. Audio preference

Zapamiętać:
```text
vault.audio.enabled
```

w `localStorage`.

Jeżeli użytkownik poprzednio wyłączył dźwięk:
- nie uruchamiać go automatycznie przy kolejnej wizycie.

Pierwsza wizyta:
- domyślnie można proponować audio;
- nadal wymagany user gesture.

---

# 36. WebGL fog

Unikać prawdziwego volumetric raymarchingu na całym ekranie.

Na mobile może być zbyt ciężki.

Preferowana iluzja:
- fullscreen transparent plane;
- 1–2 noise layers;
- low-frequency movement;
- radial mask w centrum;
- bardzo mała liczba octave.

Fog ma wspierać film, a nie być technicznym demo shaderów.

---

# 37. Particles

Particles:
- `THREE.Points` albo instancing;
- jeden draw call;
- proceduralne pozycje;
- brak setState;
- brak tworzenia obiektów w każdej klatce.

Nie aktualizować tysiąca pozycji CPU co frame, jeśli efekt może być wykonany w vertex shaderze.

---

# 38. Distortion

Distortion ma być używany tylko w kluczowych momentach:
- authorization pulse;
- artifact reveal;
- tap artifact;
- containment failure.

Nie utrzymywać stale intensywnego distortion.

Jeżeli pełny postprocessing okaże się za ciężki:
- użyć pojedynczego fullscreen shader plane;
- albo wyłączyć distortion na low tier.

---

# 39. Render loop

Jedna pętla rAF.

W niej:
1. oblicz delta time;
2. zaktualizuj eased progress;
3. zaktualizuj video scrubber;
4. zaktualizuj pointer damping;
5. zaktualizuj shader uniforms;
6. zaktualizuj adaptive quality metrics;
7. render WebGL.

Nie uruchamiać osobnych rAF w kilku komponentach.

---

# 40. Visibility

Na:

```ts
document.visibilitychange
```

gdy strona ukryta:
- wstrzymać WebGL update;
- nie wykonywać seeków;
- opcjonalnie ściszyć / pauzować audio.

Po powrocie:
- zsynchronizować target progress;
- wznowić bez gwałtownego skoku.

---

# 41. Cleanup

Przy unmount:
- `cancelAnimationFrame`;
- remove event listeners;
- dispose geometries;
- dispose materials;
- dispose textures;
- `renderer.dispose()`;
- disconnect audio nodes;
- revoke blob URLs, jeśli powstaną.

Brak wycieków po HMR.

---

# 42. Accessibility

## prefers-reduced-motion

Jeżeli:

```css
@media (prefers-reduced-motion: reduce)
```

lub JS matchMedia:

nie zmuszać użytkownika do intensywnego scrubowania.

Fallback:
- poster;
- delikatne crossfade kluczowych stanów;
- statyczny reveal artefaktu;
- możliwość przejścia przez historię przyciskiem;
- bez camera rumble;
- bez distortion.

## Keyboard

- Enter / Space — authorize;
- Tab — audio / replay;
- focus-visible zawsze widoczny.

## ARIA

Przyciski muszą mieć realne `<button>`.

Nie robić klikalnych `<div>`.

Audio toggle:
```text
aria-label="Turn sound off"
```
lub odpowiedni aktualny stan.

---

# 43. Favicon SVG

Wymagany plik:

`public/favicon.svg`

Minimalistyczny symbol circular vault.

Przykładowa baza:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#070809"/>
  <circle cx="32" cy="32" r="21"
          fill="none"
          stroke="#d7b77a"
          stroke-width="4"/>
  <circle cx="32" cy="32" r="7"
          fill="none"
          stroke="#d7b77a"
          stroke-width="3"/>
  <path d="M32 11v9M32 44v9M11 32h9M44 32h9"
        stroke="#d7b77a"
        stroke-width="3"
        stroke-linecap="round"/>
</svg>
```

Przetestować favicon:
- w jasnej karcie;
- w ciemnej karcie;
- w bardzo małym rozmiarze.

Nie dodawać tekstu do favicon.

---

# 44. Metadata / SEO

`index.html` powinien mieć co najmniej:

```html
<title>The Vault — Interactive WebGL Experience</title>

<meta
  name="description"
  content="The Vault is a cinematic interactive WebGL experiment built around a mysterious containment chamber."
/>

<meta name="theme-color" content="#070809" />
<meta name="color-scheme" content="dark" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Open Graph:
- title;
- description;
- image;
- type website.

Twitter card:
`summary_large_image`.

Canonical po publikacji:
`https://apkmasondev.github.io/the_vault/`

Jeśli później projekt dostanie custom domain:
- zaktualizować canonical;
- zaktualizować OG URL;
- zmienić Vite `base`, jeśli potrzebne.

---

# 45. OG image

`1200×630`.

Użyć:
- kadru vaultu;
- ciemnego tła;
- jednej mocnej kompozycji.

Może zawierać mały napis:
`THE VAULT`.

Nie robić reklamy pełnej drobnych tekstów.

---

# 46. robots.txt

Minimalny:

```txt
User-agent: *
Allow: /
```

Nie dodawać sitemap, jeśli finalnie nie jest potrzebna.

Jeśli będzie generowana, ma wskazywać poprawny adres projektu.

---

# 47. Performance budgets

To są cele projektowe, nie gwarancje.

## Initial shell

Przed autoryzacją:
- JS/CSS możliwie małe;
- poster zoptymalizowany;
- brak ładowania ciężkich efektów bez potrzeby.

## Media

Dążyć do:
- 720p GOP1: możliwie rozsądny rozmiar bez widocznego bandingu;
- 540p GOP1: realnie lżejszy wariant.

Nie ustawiać arbitralnie ekstremalnego bitrate.

Ocenić jakość po encodingu:
- ciemne gradienty;
- mgła;
- metal;
- ring lights.

W ciemnych scenach banding jest szczególnie widoczny.

---

# 48. LCP

Pierwszym dużym elementem ma być poster, nie pusty canvas.

Poster:
- preload jako image;
- `fetchpriority="high"`;
- render od razu.

WebGL inicjalizować tak, żeby nie opóźniał pierwszego wizualnego renderu.

---

# 49. Zero layout shift

Stage ma mieć wymiar od pierwszego renderu.

Nie może wystąpić:
- skok po załadowaniu filmu;
- skok po fontach;
- skok po pokazaniu HUD.

UI absolute / fixed w stage.

---

# 50. Błędy mediów

Jeżeli video nie może się załadować:
- nie zostawiać czarnego ekranu;
- użyć poster;
- pokazać dyskretny komunikat;
- WebGL reveal nadal może działać w ograniczonym trybie.

Nie renderować stack trace użytkownikowi.

---

# 51. WebGL fallback

Sprawdzić WebGL support.

Jeśli brak:
- wyświetlić cinematic fallback;
- filmy mogą nadal działać;
- artefakt jako statyczna kompozycja / CSS glow;
- żadnego crasha.

---

# 52. Kod — TypeScript

`strict: true`.

Nie używać `any`, jeśli nie jest to naprawdę konieczne.

Wartości timeline i config:
- typowane;
- readonly;
- centralne.

Funkcje progress mapping:
- czyste;
- przetestowane.

---

# 53. ESLint / formatting

Wymagane komendy:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Agent może zmienić komendy, jeśli aktualny toolchain tego wymaga.

Finalnie mają przechodzić:
- lint;
- typecheck;
- test;
- build.

---

# 54. Minimalne testy jednostkowe

Testować:
- clamp;
- mapRange;
- timeline boundary;
- mapowanie scroll → video time;
- cutoff filmu 2;
- brak wartości `< 0` i `> duration`.

Przykłady:

```text
progress = video1Start → time = 0
progress = video1End → time = duration
progress poza zakresem → clamp
```

---

# 55. Manual QA matrix

Minimum:

Desktop:
- Chrome;
- Edge;
- Firefox.

Jeśli dostępne:
- Safari macOS.

Mobile:
- Chrome Android;
- Safari iPhone.

Testy:
- portrait;
- landscape;
- 60 Hz;
- urządzenie high-DPR;
- wolniejszy telefon;
- dotyk;
- szybki flick scroll;
- bardzo wolny scroll;
- scroll wstecz;
- zmiana orientacji;
- background → foreground;
- reload w połowie;
- cache empty;
- cache warm.

---

# 56. Kryterium płynności

Priorytet:
- brak widocznych skoków klatek;
- brak freeze przy przejściu między filmami;
- brak białych / czarnych flashów;
- brak szarpania canvasu przy scrollu;
- brak przeciążenia GPU na mobile.

Cel:
- high/medium tier: dążyć do stabilnego 60 FPS dla WebGL;
- low tier: stabilne ~30–60 FPS jest lepsze niż niestabilne 60.

Video scrub ma wyglądać płynnie nawet wtedy, gdy WebGL zostanie automatycznie uproszczony.

---

# 57. Debug overlay — tylko development

Opcjonalny panel pod klawiszem np. `D`:

```text
progress
displayProgress
video1 current/target
video2 current/target
fps avg
quality tier
DPR
viewport
```

Panel:
- tylko `import.meta.env.DEV`;
- nie trafia do UI produkcyjnego.

Bardzo ułatwi strojenie mobile.

---

# 58. Breakpointy

Nie budować projektu wyłącznie wokół klasycznych nazw device.

Przykładowo:

```css
--mobile: < 768px
--tablet: 768–1199px
--desktop: >= 1200px
```

Dodatkowo używać:
- `pointer: coarse`;
- `hover: none`;
- aspect ratio.

Pionowy tablet może potrzebować layoutu bliższego mobile.

---

# 59. Small screens

Na bardzo małym ekranie:
- mniej HUD;
- większe touch targets;
- brak drobnych etykiet technicznych;
- vault nadal centralny;
- tytuł nie może przykrywać wrót.

UI musi być testowane około 320–360 CSS px szerokości.

---

# 60. Audio toggle UI

Ikona:
- prosta;
- SVG inline;
- nie emoji.

Stan:
- sound on;
- sound off.

Hit area:
min. około 44×44 CSS px.

Ikona może mieć 18–20 px, ale obszar klikalny większy.

---

# 61. Scroll indicator

Po autoryzacji można przez pierwsze sekundy pokazać:

```text
SCROLL TO RELEASE
```

z bardzo subtelnym wskaźnikiem.

Ma zniknąć natychmiast po wykryciu pierwszego realnego scrolla.

Nie wracać.

---

# 62. Mouse parallax

Desktop:
- film / media stage maksymalnie kilka px;
- WebGL bardziej niż film;
- UI pozostaje stabilne.

Przykładowo:
- video: `±3 px`;
- particles: `±8 px`;
- artefakt: rotacja `±2°`.

Nie tworzyć efektu pływającego całego layoutu.

---

# 63. Camera rumble

Nie przesuwać fizycznej kamery DOM o duże wartości.

W krytycznym momencie:
- 1–2 px;
- krótkie;
- tłumione.

Wyłączone przy reduced motion.

---

# 64. Crossfade między filmami

Film 1 i Film 2 mogą istnieć równolegle jako dwie warstwy.

Nie robić:
`src = nowy film` na jednym elemencie w kluczowym momencie.

Preferowane:
- `video1`;
- `video2`;
- opacity transition.

Przed przejściem:
- video2 musi być gotowy;
- currentTime video2 = 0;
- video1 pozostaje na ostatniej klatce.

Crossfade:
około `120–250 ms`.

Jeśli pierwsza klatka filmu 2 jest idealnie zgodna z końcem filmu 1, crossfade może być praktycznie niewidoczny.

---

# 65. Zgodność klatek Film 1 → Film 2

Agent ma porównać:
- ostatnią klatkę Filmu 1;
- pierwszą klatkę Filmu 2.

Jeżeli występuje:
- minimalny brightness shift;
- niewielki contrast shift;
- drobny framing shift;

można kompensować CSS:
- opacity;
- brightness;
- transform;
- bardzo krótki crossfade.

Nie wykonywać agresywnej korekcji, która zmienia charakter materiału.

---

# 66. Nie dopasowywać WebGL do fake 3D kamery

WebGL artifact znajduje się dopiero po otwarciu.

Nie trzeba tworzyć perspektywy odpowiadającej geometrii całych wrót.

Wystarczy:
- centralny camera FOV;
- artefakt osadzony w osi otworu;
- halo i haze maskujące granicę.

To ma być wizualnie przekonujące, nie geometrycznie rekonstruowane.

---

# 67. GitHub Pages — konfiguracja Vite

Repo jest projektem:

`apkmasondev/the_vault`

Przy publikacji pod:

```text
https://apkmasondev.github.io/the_vault/
```

Vite musi używać:

```ts
export default defineConfig({
  base: '/the_vault/',
});
```

Nie hardcodować assetów jako:

```text
/media/file.mp4
```

jeśli ominie to base path.

Dla plików w `public` używać bezpiecznego helpera, np.:

```ts
const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
```

Przykład:

```ts
asset('media/vault-unlock-720-gop1.mp4');
```

---

# 68. GitHub Pages — Actions

W `Settings → Pages`:
- Source: `GitHub Actions`.

Workflow:
`.github/workflows/deploy.yml`.

Ma:
1. checkout;
2. setup Node LTS;
3. `npm ci`;
4. `npm run build`;
5. configure Pages;
6. upload `dist`;
7. deploy Pages artifact.

Permissions:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

Environment:
`github-pages`.

Concurrency:
- jedna aktywna publikacja;
- nowy deploy może anulować starszy in-progress, jeśli oficjalny template nadal to rekomenduje.

Przy implementacji użyć aktualnych oficjalnych wersji / SHA akcji z dokumentacji GitHub, zamiast kopiować stare numery z przypadkowych tutoriali.

---

# 69. CI osobno od deploy

`ci.yml` na pull request / push:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

Deploy nie może publikować kodu, który nie przechodzi podstawowego builda.

---

# 70. GitHub Pages — brak routera

Jeśli strona pozostaje single-page bez route:
- nie dodawać React Router;
- nie tworzyć 404 hacka.

Jeśli później pojawią się podstrony, dopiero wtedy zaplanować routing zgodny ze statycznym hostingiem.

---

# 71. Custom domain w przyszłości

Jeśli THE VAULT dostanie własną domenę:
- Vite `base` zwykle zmieni się na `/`;
- trzeba zaktualizować canonical;
- OG URL;
- GitHub Pages domain settings.

Nie dodawać pliku `CNAME` „na zapas”.

---

# 72. Security

Projekt nie potrzebuje:
- API keys;
- tokenów;
- backend secrets.

Nie umieszczać sekretów w repo.

Jeśli nie ma zewnętrznych API, nie dodawać zbędnych env variables.

Unikać:
- `dangerouslySetInnerHTML`;
- dynamicznego HTML;
- zewnętrznych skryptów analytics bez potrzeby.

---

# 73. External assets

Preferować assety lokalne.

Projekt powinien działać bez:
- zewnętrznych CDN z shaderami;
- zewnętrznych tekstur;
- runtime fetch do losowych serwisów.

Korzyści:
- powtarzalność;
- GitHub Pages;
- szybkość;
- brak CORS surprises.

---

# 74. Loading strategy WebGL

Kod cięższych elementów Three.js można załadować dynamicznie po wyrenderowaniu entry shell.

Przykład:
- UI pojawia się;
- poster widoczny;
- moduł WebGL ładuje się asynchronicznie;
- Entry Gate staje się aktywny, gdy renderer jest gotowy.

Nie pokazywać pustego ekranu tylko dlatego, że Three.js jeszcze się parsuje.

---

# 75. Bundle

Po buildzie sprawdzić:
- wielkość JS;
- duplikowane zależności;
- sourcemap policy;
- czy przypadkiem nie zaimportowano całej ciężkiej biblioteki dla jednego helpera.

Nie optymalizować mikro-bajtów kosztem czytelności, ale usunąć ewidentny balast.

---

# 76. Mobile memory

Nie trzymać:
- dwóch wielkich kopii filmów jako ArrayBuffer + Blob + `<video>` jednocześnie;
- niepotrzebnych dużych framebufferów;
- kilku pełnoekranowych postprocess render targets.

Jeśli postprocessing:
- maksymalnie jeden potrzebny buffer;
- low tier bez niego.

---

# 77. WebGL context loss

Dodać obsługę:
`webglcontextlost`
i
`webglcontextrestored`.

Przy context lost:
- zapobiec crashowi UI;
- pokazać fallback / spróbować odtworzyć renderer.

---

# 78. Color management

Three.js:
- ustawić aktualny poprawny output color space zgodnie z bieżącą wersją biblioteki;
- nie kopiować starych snippetów z `outputEncoding`, jeśli API zostało zmienione.

Celem jest:
- brak przepalonego artefaktu;
- spójność z sRGB filmu.

---

# 79. UI transitions

Preferować:
- opacity;
- transform;
- filter tylko bardzo ostrożnie.

Nie animować:
- width;
- height;
- top/left;
jeśli można użyć transform.

Unikać ciężkiego `backdrop-filter` na cały ekran.

---

# 80. Copy — finalny zestaw

Tekstów ma być mało.

Proponowany zestaw:

```text
THE VAULT

INITIALIZING CONTAINMENT SYSTEM

HOLD TO AUTHORIZE
ENTER MUTED

ACCESS GRANTED

MECHANICAL LOCK
SEQUENCE ACTIVE

LOCK STATUS
DISENGAGED

CONTAINMENT RELEASED

DO NOT OPEN.

OBJECT: UNKNOWN
ORIGIN: UNKNOWN
STABILITY: 03%

CONTAINMENT FAILURE

THE VAULT
AN INTERACTIVE WEBGL EXPERIMENT

REPLAY
```

Nie trzeba wykorzystać wszystkich.

Agent ma ocenić rytm sceny.

---

# 81. Branding

Nie dodawać:
- dużego logo ApkMason;
- menu do portfolio;
- linków do kilkunastu projektów.

W finale może istnieć mały:
`ApkMason.dev`

Opcjonalnie jako subtelny link.

THE VAULT ma pozostać samodzielnym dziełem.

---

# 82. Dopracowanie detali

Wymagane:
- custom cursor tylko jeśli nie pogarsza UX;
- selection color dopasowany do accent;
- focus ring;
- tap highlight kontrolowany na mobile;
- overscroll zachowujący się poprawnie;
- brak przypadkowego poziomego scrolla;
- `box-sizing: border-box`;
- poprawny `font-smoothing` tylko jeśli rzeczywiście potrzebny;
- brak `user-select: none` globalnie;
- przyciski działające klawiaturą;
- SVG icons bez rasterowych artefaktów.

---

# 83. Body / overscroll

Rozważyć:

```css
html,
body {
  margin: 0;
  background: #070809;
}

body {
  overflow-x: hidden;
}
```

Nie blokować pionowego scrolla po autoryzacji.

Na iOS nie stosować agresywnych hacków z `position: fixed` na `body`, jeśli nie są konieczne.

---

# 84. Safe areas

Mobile fullscreen UI:

```css
padding-top: env(safe-area-inset-top);
padding-right: env(safe-area-inset-right);
padding-bottom: env(safe-area-inset-bottom);
padding-left: env(safe-area-inset-left);
```

Audio toggle / replay nie mogą wejść pod notch / home indicator.

---

# 85. Reduced data

Jeśli:
```ts
navigator.connection?.saveData === true
```

preferować:
- 540p;
- mniej preloadu;
- low / medium WebGL;
- brak niepotrzebnych assetów.

Nie blokować projektu całkowicie.

---

# 86. Offline / PWA

Nie dodawać PWA ani service workera w pierwszej wersji.

Projekt jest statycznym eksperymentem.

Service worker może komplikować cache nowych wersji ciężkich filmów.

Jeśli kiedyś zostanie dodany, musi być świadomą decyzją.

---

# 87. Analytics

Brak analytics w MVP.

Jeśli później zostaną dodane:
- minimalne;
- zgodne z prywatnością;
- bez wpływu na loading experience.

---

# 88. README

README powinien zawierać:
- krótki opis;
- tech stack;
- uruchomienie lokalne;
- build;
- deploy;
- struktura mediów;
- credits do użytych narzędzi;
- informację, że filmy są pre-renderowane, a reveal jest WebGL.

Nie umieszczać kilkuset linii planu w README.
PLAN.md pozostaje osobno.

---

# 89. Kolejność implementacji

## Etap 1 — repo + foundation
- Vite;
- React;
- TypeScript strict;
- lint;
- tests;
- base path;
- global CSS;
- favicon;
- metadata.

## Etap 2 — media
- preprocessing GOP1;
- poster;
- dwa video layers;
- scrubber;
- progress timeline;
- test desktop i mobile zanim powstanie WebGL.

**Jeżeli video scrubbing nie jest płynny, nie przechodzić dalej.**

## Etap 3 — entry gate
- loader;
- hold;
- muted entry;
- audio bootstrap.

## Etap 4 — UI timeline
- HUD;
- copy;
- transitions;
- interlude.

## Etap 5 — WebGL foundation
- transparent renderer;
- quality tier;
- particles;
- fog.

## Etap 6 — artifact
- shader;
- Fresnel;
- inner stars;
- interaction;
- final pulse.

## Etap 7 — audio
- soundtrack;
- gain fades;
- preference.

## Etap 8 — mobile polish
- portrait stage;
- touch;
- safe-area;
- DPR;
- adaptive quality.

## Etap 9 — reduced motion / fallback
- accessibility;
- WebGL fallback;
- media error states.

## Etap 10 — QA
- lint;
- typecheck;
- tests;
- production build;
- device testing;
- console audit;
- performance profiling.

## Etap 11 — GitHub Pages
- Actions;
- deployment;
- asset path verification;
- final production smoke test.

---

# 90. Definition of Done

Projekt jest gotowy dopiero, gdy:

- [ ] Film 1 i Film 2 są natywnymi 720p źródłami bez sztucznego upscale.
- [ ] Wersje scrollowane są GOP1.
- [ ] Filmy nie zawierają audio.
- [ ] Film 1 → Film 2 nie ma widocznego flasha.
- [ ] Film 2 → WebGL wygląda jak jedno ciągłe ujęcie.
- [ ] Cutoff filmu 2 został dobrany wizualnie, nie tylko według planu.
- [ ] Mobile portrait zachowuje czytelny pełny vault.
- [ ] Nie ma agresywnego `object-fit: cover` wycinającego większość sceny.
- [ ] Video scrub działa w przód i wstecz.
- [ ] Szybki scroll nie powoduje trwałego pozostania filmu daleko w tyle.
- [ ] WebGL automatycznie obniża jakość na słabszym urządzeniu.
- [ ] Nie ma pełnoekranowego ciężkiego raymarchingu na mobile.
- [ ] DPR jest ograniczony.
- [ ] Jeden render loop steruje animacją.
- [ ] Brak React setState na każdą klatkę.
- [ ] `prefers-reduced-motion` ma sensowny fallback.
- [ ] Entry działa myszą, dotykiem i klawiaturą.
- [ ] Audio uruchamia się wyłącznie po user gesture.
- [ ] Audio ma płynne fade.
- [ ] Audio preference jest zapamiętana.
- [ ] Favicon SVG jest obecny i czytelny.
- [ ] Meta title / description / OG są poprawne.
- [ ] Poster ładuje się bez layout shift.
- [ ] Nie ma poziomego scrolla.
- [ ] UI respektuje safe-area.
- [ ] Brak błędów i warningów w konsoli produkcyjnej.
- [ ] Brak martwego kodu i nieużywanych assetów.
- [ ] TypeScript strict przechodzi.
- [ ] ESLint przechodzi.
- [ ] Testy przechodzą.
- [ ] `npm run build` przechodzi.
- [ ] `npm run preview` wygląda identycznie funkcjonalnie jak dev.
- [ ] GitHub Pages działa z `/the_vault/`.
- [ ] Bezpośrednie asset URLs nie psują się po deploy.
- [ ] GitHub Actions deployuje `dist`.
- [ ] Strona działa po hard refresh.
- [ ] Finalny projekt został sprawdzony co najmniej na Chrome desktop i realnym telefonie.

---

# 91. Ostatnia zasada

Jeśli agent musi wybierać pomiędzy:

**bardziej efektownie**

a

**bardziej płynnie**

należy wybrać:

# bardziej płynnie.

WebGL ma wzmacniać filmy, nie z nimi konkurować.

Najważniejszym efektem THE VAULT nie ma być liczba shaderów.

Najważniejszym efektem ma być poczucie, że użytkownik **naprawdę otworzył coś, czego nie powinien był otwierać**.

---

# 92. Oficjalne źródła wdrożeniowe

Przy finalnej implementacji zweryfikować aktualną dokumentację:

- GitHub Pages — publishing source / GitHub Actions  
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

- Vite — static deployment / GitHub Pages / `base`  
  https://vite.dev/guide/static-deploy.html

- Three.js — WebGLRenderer / pixel ratio / renderer options  
  https://threejs.org/docs/

- MDN — `HTMLVideoElement.requestVideoFrameCallback()`  
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback

- web.dev — video performance  
  https://web.dev/learn/performance/video-performance
