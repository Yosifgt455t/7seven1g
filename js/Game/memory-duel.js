
class MemoryDuel {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.cards = [];
        this.flippedCards = [];
        this.matchedCards = [];
        this.scores = { 'P1': 0, 'P2': 0 };
        this.currentPlayer = 'P1';
        this.gameOver = false;
        this.isProcessing = false; // block input during animation

        // Online setup
        this.roomCode = config.roomCode;
        this.myRole = config.role;
        this.mySymbol = this.myRole === 'player2' ? 'P2' : 'P1';

        this.init();
    }

    init() {
        this.generateCards();
        this.render();
        if (this.config.mode === 'online') {
            this.setupOnlineListeners();
        }
    }

    generateCards() {
        const symbols = ['★', '♡', '♢', '♤', '♧', '♥', '♦', '♣'];
        const deck = [...symbols, ...symbols];
        // Shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        this.cards = deck.map((symbol, index) => ({
            id: index,
            symbol: symbol,
            isFlipped: false,
            owner: null
        }));
    }

    setupOnlineListeners() {
        SupabaseClient.subscribeToRoom(this.roomCode, (room) => {
            if (room.board_state) {
                // Sync state
                this.cards = room.board_state.cards;
                this.scores = room.board_state.scores;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'P1' ? 'P2' : 'P1');
                this.updateBoardUI();
                this.checkWinCondition(false);
            }
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="memory-board">
                ${this.cards.map(card => `
                    <div class="memory-card" data-index="${card.id}" onclick="currentGame.handleCardClick(${card.id})">
                        <div class="card-inner ${card.isFlipped || card.owner ? 'flipped' : ''}">
                            <div class="card-front">?</div>
                            <div class="card-back ${card.owner ? card.owner.toLowerCase() : ''}">${card.symbol}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .memory-board {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
                width: 320px;
                height: 320px;
                margin: 0 auto;
                perspective: 1000px;
            }
            .memory-card {
                background: transparent;
                cursor: pointer;
                height: 100%;
                width: 100%;
            }
            .card-inner {
                position: relative;
                width: 100%;
                height: 100%;
                text-align: center;
                transition: transform 0.6s;
                transform-style: preserve-3d;
            }
            .card-inner.flipped {
                transform: rotateY(180deg);
            }
            .card-front, .card-back {
                position: absolute;
                width: 100%;
                height: 100%;
                backface-visibility: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                font-size: 2rem;
                font-weight: bold;
                border: 2px solid rgba(255,255,255,0.1);
            }
            .card-front {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255,255,255,0.5);
            }
            .card-back {
                background: rgba(255, 255, 255, 0.2);
                transform: rotateY(180deg);
            }
            .card-back.p1 { border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.1); }
            .card-back.p2 { border-color: #3b82f6; color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
        `;
        this.container.appendChild(style);
        this.updateStatus();
    }

    updateBoardUI() {
        const cardsEl = this.container.querySelectorAll('.card-inner');
        this.cards.forEach((card, i) => {
            const el = cardsEl[i];
            if (card.isFlipped || card.owner) {
                el.classList.add('flipped');
            } else {
                el.classList.remove('flipped');
            }

            // Update back styling usually not needed unless owner changed dynamically (which it does)
            const backEl = el.querySelector('.card-back');
            backEl.className = `card-back ${card.owner ? card.owner.toLowerCase() : ''}`;
        });
        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) return;

        let msg = '';
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === this.mySymbol);
            msg = isMyTurn ? 'دورك!' : 'دور الخصم...';
        } else {
            msg = `الدور: ${this.currentPlayer === 'P1' ? 'اللاعب 1' : 'اللاعب 2'}`;
        }
        msg += ` | النتائج: P1 (${this.scores.P1}) - P2 (${this.scores.P2})`;
        statusEl.innerText = msg;
    }

    async handleCardClick(index) {
        if (this.gameOver || this.isProcessing) return;

        const card = this.cards[index];
        if (card.isFlipped || card.owner) return; // Already matched or flipped

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === this.mySymbol);
            if (!isMyTurn) return;
        }

        // Flip logic
        card.isFlipped = true;
        this.flippedCards.push(index);
        this.updateBoardUI();

        if (this.flippedCards.length === 2) {
            this.isProcessing = true;
            await this.checkMatch();
            this.isProcessing = false;
        } else {
            // Need to sync first flip online
            this.sendOnlineUpdate();
        }
    }

    async checkMatch() {
        const [idx1, idx2] = this.flippedCards;
        const card1 = this.cards[idx1];
        const card2 = this.cards[idx2];

        // Delay for viewing
        await new Promise(r => setTimeout(r, 800));

        if (card1.symbol === card2.symbol) {
            // Match!
            card1.owner = this.currentPlayer;
            card2.owner = this.currentPlayer;
            this.scores[this.currentPlayer]++;

            this.flippedCards = []; // Reset flipped list, leave them visible via 'owner'

            // Player keeps turn on match

        } else {
            // No Match
            card1.isFlipped = false;
            card2.isFlipped = false;
            this.flippedCards = [];

            // Switch Turn
            this.currentPlayer = this.currentPlayer === 'P1' ? 'P2' : 'P1';
        }

        this.sendOnlineUpdate();
        this.updateBoardUI();
        this.checkWinCondition();

        // AI Turn
        if (this.config.mode === 'ai' && this.currentPlayer === 'P2' && !this.gameOver) {
            setTimeout(() => this.makeAiMove(), 500);
        }
    }

    sendOnlineUpdate() {
        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                { cards: this.cards, scores: this.scores },
                null,
                { flipped: this.flippedCards }
            );
        }
    }

    makeAiMove() {
        // AI Logic:
        // Easy: Random 2 unknown cards.
        // Medium: Remember seen cards. (Not implemented fully for brevity, standard random for now or perfect memory cheat)

        // Find unknown cards
        const unknowns = this.cards.filter(c => !c.owner && !c.isFlipped).map(c => c.id);
        if (unknowns.length < 2) return;

        // Pick 1
        const pick1 = unknowns[Math.floor(Math.random() * unknowns.length)];
        this.handleCardClick(pick1);

        // Pick 2 (delay)
        setTimeout(() => {
            // Re-calc unknowns minus pick1
            const unknowns2 = unknowns.filter(id => id !== pick1);
            if (unknowns2.length > 0) {
                const pick2 = unknowns2[Math.floor(Math.random() * unknowns2.length)];
                this.handleCardClick(pick2);
            }
        }, 600);
    }

    checkWinCondition(triggerUI = true) {
        if (this.scores.P1 + this.scores.P2 === 8) { // 8 pairs total
            const winner = this.scores.P1 > this.scores.P2 ? 'اللاعب 1' : (this.scores.P2 > this.scores.P1 ? 'اللاعب 2' : 'تعادل');
            if (triggerUI) this.endGame(winner);
            return true;
        }
        return false;
    }

    endGame(winner) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        statusEl.innerText = `انتهت اللعبة! الفائز: ${winner}`;
        statusEl.style.color = '#22c55e';
    }
}
