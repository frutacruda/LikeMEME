# FollowMe Functional Specification

> Status: MVP functional specification
> Purpose: Source of truth for product behavior and game rules. Technical architecture is defined separately after validation.

## 1. Product Overview

FollowMe is a real-time multiplayer web game for 2–4 players. Each round, all players see the same meme/reference image, imitate it in front of their own camera, and are photographed automatically. AI compares each submitted photo with the reference and returns integer similarity scores for expression, pose, and style. The game lasts 5 rounds and final ranking is based primarily on accumulated round wins.

## 2. Core Game Flow

1. Create or join a room.
2. Enter a unique nickname within the room.
3. Wait for 2–4 players.
4. Host starts the game.
5. Select 5 unique memes randomly from the registered meme pool.
6. For each round:
   - Show the same meme to all active players.
   - Observation period: 3 seconds.
   - Countdown: 5 seconds.
   - Automatically capture and submit each player's camera image.
   - Wait until all current players have submitted.
   - AI scores expression, pose, and style.
   - Reveal category scores sequentially, then total synchronization rate and round ranking.
   - Award +1 win to the round winner(s).
   - Hold the result for 5 seconds and automatically continue.
7. After Round 5, calculate and display the final ranking.
8. Delete captured photos after the game for the MVP.

## 3. Functional Requirements

### 3.1 Main / Room Entry

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| MAIN-01 | Open game instructions | Select `?` | Show onboarding/instructions modal | Close via X |
| MAIN-02 | Create room | Select Create Room | Create a new room and issue a unique 6-digit room code | Prevent duplicate creation requests while processing |
| MAIN-03 | Invite friends | Select Invite | Share a URL that directly identifies the room using the OS share sheet | Fallback to copying invite link if unsupported |
| MAIN-04 | Join via invite URL | Open room invite URL | Skip room-code input and continue to nickname entry for that room | Reject ended/nonexistent rooms |
| MAIN-05 | Join via code | Select Join by Code | Accept 6-digit room code and enter a valid room | Show invalid-code state when necessary |

### 3.2 Waiting Room / Players

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| ROOM-01 | Set nickname | Enter valid room | Create player after nickname submission | Duplicate nickname within same room prohibited |
| ROOM-02 | Realtime participant list | Player joins/leaves | Reflect current participants on all clients | 2–4 players per game |
| ROOM-03 | Player color | First successful join | Assign a unique color by join order | Keep color for entire game |
| ROOM-04 | Start game | Host selects Start and at least 2 players are present | Host only; synchronize all players into game state | Block new joins after game starts |
| ROOM-05 | Camera readiness | Before game begins | Verify camera availability/permission on each device | If unavailable/denied, show guidance and prevent participation until usable |

### 3.3 Round / Camera

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| GAME-01 | Round indicator | Game start / previous round end | Display `ROUND N` and `N/5` progress | Exactly 5 rounds |
| GAME-02 | Random meme selection | Game start | Select 5 memes randomly from the registered pool | No duplicate meme within the same game |
| GAME-03 | Meme display | Round start | Show the same meme to all active players | Each meme has one predefined key category: expression, pose, or style |
| GAME-04 | Observation | Meme becomes visible | Allow 3 seconds to observe the meme | Automatically proceed |
| GAME-05 | Countdown | Observation ends | Display 5 → 4 → 3 → 2 → 1 | Runs on each participating device |
| GAME-06 | Auto capture and submit | Countdown ends | Automatically capture and submit the player's camera image | No user-requested retake |
| GAME-07 | Capture failure recovery | System-level capture failure | Offer another capture attempt | Only for system failure; never because user dislikes the photo |
| GAME-08 | Wait for submissions | Local capture completes | Wait for all currently active players' submissions | Start judging only after all required submissions arrive |

### 3.4 AI Judging / Score Reveal

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| JUDGE-01 | AI image scoring | All active-player submissions complete | Compare each player photo with the reference and return expression/pose/style integer scores from 0–10 | Do not generate judging explanations |
| JUDGE-02 | Anonymous randomized evaluation | Build AI request | Do not provide player names, prior wins, or prior scores; randomize participant evaluation order each round | Apply identical criteria to every player |
| JUDGE-03 | AI failure recovery | AI request fails | Retry automatically once | If retry also fails, invalidate the round, award no wins, and continue |
| JUDGE-04 | Category synchronization rate | AI scores received | `category rate = category score × 10` | Display as integer percent |
| JUDGE-05 | Overall synchronization rate | AI scores received | `(expression + pose + style) / 30 × 100` | Display rounded integer percent; winner uses raw 30-point sum, not displayed percent |
| JUDGE-06 | Sequential score reveal | Judging completes | Reveal expression → pose → style → overall synchronization/ranking sequentially | Do not reveal everything simultaneously |

### 3.5 Round Result / Progression

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| RESULT-01 | Round ranking | Scores calculated | Rank by raw total out of 30 | Apply round tie rules below |
| RESULT-02 | Award round win | Winner(s) determined | Add +1 accumulated win to every round winner | Joint winners each receive +1 |
| RESULT-03 | Automatic progression | Result reveal completes | Keep result visible for 5 seconds, then continue automatically | After Round 5, proceed to final result |

### 3.6 Final Result

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| FINAL-01 | Calculate final ranking | Round 5 ends | Apply final ranking rules below | Joint ranks allowed |
| FINAL-02 | Display ranking | Ranking calculated | 2 players: show 1st/2nd. 3–4 players: emphasize 1st/2nd/3rd | If two players share 1st, next rank is 3rd |
| FINAL-03 | Display player results | Game ends | Show accumulated wins and final result per player | Preserve player colors |
| FINAL-04 | Return to main | Select Return to Main | End game and navigate to main | Captured photos are deleted for MVP |

### 3.7 BGM / Sound

| ID | Feature | Trigger | Required behavior | Policy / exception |
|---|---|---|---|---|
| SOUND-01 | Game BGM | Game experience begins | Provide background music during game progression | Start playback only when permitted by browser autoplay policy; user interaction may be required |
| SOUND-02 | BGM toggle | User selects sound control | Allow the user to turn BGM on/off | Preserve the current setting during the game where feasible |
| SOUND-03 | Audio coordination | Round/result transitions | Keep BGM behavior compatible with countdown, capture, score reveal, and result presentation | Exact track selection and per-state BGM transitions are defined later |

## 4. AI Scoring Rules

All three categories return **integer scores from 0 to 10 in increments of 1**.

### 4.1 Expression Similarity

Evaluate eyes, eyebrows, mouth shape, emotional intensity, and face direction.

| Score | Standard |
|---|---|
| 0–2 | Almost entirely different from the reference |
| 3–4 | Only some features are similar |
| 5–6 | Core emotion is similar, but detailed expression differs |
| 7–8 | Most expression characteristics are similar |
| 9–10 | Emotion and detailed facial expression are highly similar |

### 4.2 Pose Similarity

Evaluate body direction, arms, legs, hands, tilt, silhouette, and placement within the frame.

| Score | Standard |
|---|---|
| 0–2 | Pose is almost entirely different |
| 3–4 | Only some movements are similar |
| 5–6 | Core pose is similar, but detailed positioning differs |
| 7–8 | Body direction and major movements are similar |
| 9–10 | Pose and framing are highly similar |

### 4.3 Style Similarity

Evaluate hairstyle, hair color, clothing type/color/pattern, accessories, and props.

| Score | Standard |
|---|---|
| 0–2 | Almost no visual similarity |
| 3–4 | Only some colors/items are similar |
| 5–6 | Major style characteristics are generally similar |
| 7–8 | Major hair/clothing characteristics are similar |
| 9–10 | Overall style and detailed elements are highly similar |

### 4.4 AI Fairness / Evaluation Principles

- Apply the same criteria and score ranges to every player.
- Do not provide the AI with player names, existing win counts, or previous scores.
- Randomize the order of player photos for each round.
- Evaluate only elements that can be confirmed in the reference image.
- If an element is visible in the reference but omitted because of the player's capture framing, treat it as not reproduced.
- Do not evaluate attractiveness/appearance, gender, age, body type, skin color, or clothing price.
- Do not evaluate camera quality or the beauty/quality of the background.
- Do **not** generate or display textual judging reasons.

## 5. Score Calculation

### Category synchronization rate

```text
category synchronization rate = category score × 10
```

Example: expression 8 → 80%.

### Overall synchronization rate

```text
overall synchronization rate
= (expression + pose + style) / 30 × 100
```

Example: 8 + 7 + 9 = 24 → `24 / 30 × 100 = 80%`.

The UI displays the rounded integer percentage. **Round winner determination must use the raw 30-point total, not the displayed percentage.**

## 6. Round Tie Rules

Each meme in the meme pool has exactly one predefined **key category**:

- Expression-focused meme → expression is key.
- Body-action-focused meme → pose is key.
- Hair/clothing/prop-focused meme → style is key.

When raw totals are tied, compare in this order:

1. Higher score in that meme's key category.
2. Higher lowest score among the three categories.
3. Higher second-lowest score among the three categories.
4. If still identical, declare a joint round win.

Every joint round winner receives **+1 accumulated win**.

## 7. Final Ranking Rules

After 5 rounds, rank players in this order:

1. More accumulated round wins.
2. Higher accumulated raw total score across the 5 rounds.
3. More second-place finishes.
4. Higher lowest single-round total score.
5. Higher highest single-round total score.
6. If all conditions remain equal, assign a joint rank.

Display policy:

- 2-player game: display 1st and 2nd.
- 3–4-player game: emphasize 1st, 2nd, and 3rd.
- If two players share 1st place, the next player is 3rd.
- In a 4-player game, the 4th player's result still exists and should remain available even when the podium emphasizes only the top 3.

## 8. Realtime / Connection Behavior

- The room creator is the host.
- Only the host can start the game.
- Once the game starts, all rounds progress automatically.
- New players cannot enter after game start.
- A round starts for all active players from the same shared round state.
- Judging begins only after all currently active players have submitted their photos.
- If a player disconnects during the game, allow a reconnect grace period.
- If the player does not return within that period, exclude them and continue with the remaining players.
- If only one player remains, end the game.
- Exact reconnect grace period is a technical-design decision.

## 9. Failure / Exception Policies

| Situation | MVP behavior |
|---|---|
| Camera permission denied / unavailable | Detect before game start, show guidance, and block participation until camera is usable |
| User dislikes captured photo | No retake |
| System capture failure | Allow another capture attempt; do not assign 0 |
| Capture succeeded but upload failed | Re-upload the same captured image rather than taking another photo |
| Some players finish capture earlier | Wait for all active-player submissions |
| AI request fails | Retry once automatically |
| AI retry also fails | Invalidate that round, award no wins, continue to next round |
| Join after game start | Reject entry |
| Room already has 4 players | Reject entry |
| Room does not exist / has ended | Show unavailable-room state and guide back to main |
| Player disconnects | Wait for reconnect grace period, then exclude if absent |
| Only one player remains | End game |

### Invalid AI round and final statistics

For MVP, an AI-invalidated round should not award wins. When implementing final-ranking statistics that depend on scores, invalid rounds should be treated as invalid data rather than as a zero score. Exact handling of edge cases such as a game with no valid rounds should be explicitly covered in technical design/tests.

## 10. Meme Pool Requirements

Each registered meme needs at least:

```text
- meme identifier
- image asset/reference
- key category: expression | pose | style
```

At game start, randomly choose 5 unique memes from the available pool. The same meme may appear again in a different game.

## 11. Photo Data Policy

- Captured photos are used only for game progression and AI evaluation in the MVP.
- Delete captured photos when the game ends under the normal flow.
- The implementation should also support cleanup of abandoned/expired game data rather than relying only on browser-close events.
- Do not expose AI/provider secrets or privileged storage credentials to clients.
- The MVP does not provide a user-facing save/history feature.
- Future versions may add explicit photo saving/sharing, so avoid making that extension unnecessarily difficult, but do not build it now.

## 12. MVP Scope Guardrails

The following are **not required for the MVP unless explicitly added later**:

- User accounts/login
- Random matchmaking
- Friend system
- Chat
- Spectator mode
- Global rankings
- User-uploaded/custom memes
- Game replay/history
- User-triggered retakes
- Long-form AI judging explanations
- Dedicated WebSocket server
- Sophisticated anti-cheat systems

The implementation priority is a reliable end-to-end flow for **one room with 2–4 players completing a 5-round game**.

## 13. Technical Decisions Not Defined Here

Do not infer these from the functional specification. They belong in technical design after validation:

- Database schema and indexes
- Realtime transport/subscription implementation
- API/RPC boundaries
- Storage object paths and access policies
- AI provider/model and exact structured-output schema
- Server/client ownership of individual state transitions
- Reconnect grace-period duration
- Submission timeout
- Expired-room cleanup TTL
- Deployment/environment-variable configuration

