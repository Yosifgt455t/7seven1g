
class CircularTTT {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.board = Array(9).fill(null); // 0 is center, 1-8 are outer ring
        this.currentPlayer = 'X';
        this.gameOver = false;

        // Online setup
        this.roomCode = config.roomCode;
        this.myRole = config.role;
        this.mySymbol = this.myRole === 'player2' ? 'O' : 'X';

        this.init();
    }

    init() {
        this.render();
        if (this.config.mode === 'online') {
            this.setupOnlineListeners();
        }
    }

    setupOnlineListeners() {
        SupabaseClient.subscribeToRoom(this.roomCode, (room) => {
            if (room.board_state && room.board_state.board) {
                this.board = room.board_state.board;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'X' ? 'O' : 'X');
                this.updateBoardUI();
                this.checkWinCondition(false);
            }
        });
    }

    render() {
        // Center cell is index 0
        // Outer cells 1-8

        let outerCellsHtml = '';
        const radius = 120; // px
        for (let i = 1; i <= 8; i++) {
            // Start from top (index 1 at -90deg or 270deg, but standard calc puts 0 at 3 o'clock)
            // Let's arrange 1 at Top (12 o'clock).
            // 360 / 8 = 45 degrees step.
            // i=1 -> -90deg (top). i=2 -> -45deg. i=3 -> 0deg.
            const angleDeg = (i - 1) * 45 - 90;
            const angleRad = angleDeg * (Math.PI / 180);

            const x = Math.cos(angleRad) * radius;
            const y = Math.sin(angleRad) * radius;

            // Translate to center (150, 150) assuming 300x300 container
            const left = 150 + x;
            const top = 150 + y;

            outerCellsHtml += `
                <div class="cell circular-cell" data-index="${i}" 
                     style="left: ${left}px; top: ${top}px; transform: translate(-50%, -50%);"
                     onclick="currentGame.handleCellClick(${i})">
                    ${this.board[i] || ''}
                </div>
            `;
        }

        const centerCellHtml = `
            <div class="cell circular-cell center-cell" data-index="0" 
                 style="left: 150px; top: 150px; transform: translate(-50%, -50%);"
                 onclick="currentGame.handleCellClick(0)">
                ${this.board[0] || ''}
            </div>
        `;

        this.container.innerHTML = `
            <div class="circular-board">
                <div class="ring-line"></div>
                ${centerCellHtml}
                ${outerCellsHtml}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .circular-board {
                position: relative;
                width: 300px;
                height: 300px;
                margin: 0 auto;
                background: radial-gradient(circle, transparent 30%, rgba(255,255,255,0.05) 31%, transparent 70%); /* Subtle guides */
            }
            .circular-cell {
                position: absolute;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                cursor: pointer;
                transition: transform 0.2s, background 0.2s;
            }
            .circular-cell:hover {
                background: rgba(255, 255, 255, 0.25);
                transform: translate(-50%, -50%) scale(1.1) !important;
            }
             .circular-cell.x { color: #ef4444; border-color: #ef4444; }
             .circular-cell.o { color: #3b82f6; border-color: #3b82f6; }
             .circular-cell.win { background: #22c55e; color: white !important; }
             
             .ring-line {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 240px; height: 240px;
                border: 2px dashed rgba(255,255,255,0.1);
                border-radius: 50%;
                pointer-events: none;
             }
        `;
        this.container.appendChild(style);
        this.updateStatus();
    }

    updateBoardUI() {
        const cells = this.container.querySelectorAll('.circular-cell');
        // NodeList order might affect index if not careful via selector.
        // Better select by data-index
        cells.forEach(cell => {
            const index = parseInt(cell.getAttribute('data-index'));
            cell.innerText = this.board[index] || '';

            // Manage classes
            cell.classList.remove('x', 'o');
            if (this.board[index]) cell.classList.add(this.board[index].toLowerCase());
        });
        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) return; // Msg handled in endGame

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            statusEl.innerText = isMyTurn ? 'دورك!' : 'دور الخصم...';
        } else {
            statusEl.innerText = `الدور: ${this.currentPlayer}`;
        }
    }

    async handleCellClick(index) {
        if (this.gameOver || this.board[index]) return;

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            if (!isMyTurn) return;
        }

        this.makeMove(index, this.currentPlayer);

        if (this.checkWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();

        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                { board: this.board },
                null,
                { index, player: this.board[index] }
            );
        }

        if (this.config.mode === 'ai' && !this.gameOver) {
            setTimeout(() => this.makeAiMove(), 500);
        }
    }

    makeMove(index, player) {
        this.board[index] = player;
        this.updateBoardUI();
    }

    makeAiMove() {
        const availableMoves = this.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (availableMoves.length === 0) return;

        let moveIndex;
        // Priority: Center (0) if available and difficulty > easy
        if (this.config.difficulty !== 'easy' && availableMoves.includes(0)) {
            moveIndex = 0;
        } else if (this.config.difficulty === 'hard') {
            // Check win for AI
            const winningMove = availableMoves.find(idx => this.checkIfMoveWins(idx, this.currentPlayer));
            if (winningMove !== undefined) {
                moveIndex = winningMove;
            } else {
                // Block opp
                const opp = this.currentPlayer === 'X' ? 'O' : 'X';
                const blockingMove = availableMoves.find(idx => this.checkIfMoveWins(idx, opp));
                if (blockingMove !== undefined) {
                    moveIndex = blockingMove;
                } else {
                    moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
                }
            }
        } else {
            // Easy/Medium default
            moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        }

        this.makeMove(moveIndex, this.currentPlayer);
        if (this.checkWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();
    }

    checkIfMoveWins(index, player) {
        this.board[index] = player;
        const wins = this.getWinningLine(player); // Reuse logic
        this.board[index] = null;
        return !!wins;
    }

    getWinningLine(player) {
        // 1. Through Center: 1-0-5, 2-0-6, 3-0-7, 4-0-8
        const centerLines = [
            [1, 0, 5], [2, 0, 6], [3, 0, 7], [4, 0, 8]
        ];

        // 2. Adjacent on outer ring. Ring is 1..8. 
        // Trios: 1,2,3 - 2,3,4 ... 7,8,1 - 8,1,2
        const ringLines = [];
        for (let i = 1; i <= 8; i++) {
            let n1 = i;
            let n2 = (i % 8) + 1; // 1->2, 8->1
            let n3 = ((i + 1) % 8) + 1; // 1->3, 8->2
            ringLines.push([n1, n2, n3]);
        }

        const allLines = [...centerLines, ...ringLines];

        return allLines.find(line => line.every(i => this.board[i] === player));
    }

    checkWinCondition(triggerUI = true) {
        const winLine = this.getWinningLine(this.currentPlayer);

        if (winLine) {
            if (triggerUI) this.endGame(this.currentPlayer, winLine);
            return true;
        }

        if (!this.board.includes(null)) {
            if (triggerUI) this.endGame('draw');
            return true;
        }

        return false;
    }

    endGame(winner, winLine) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        if (winner === 'draw') {
            statusEl.innerText = 'تعادل!';
        } else {
            statusEl.innerText = `المنتصر: ${winner}!`;
            if (winLine) {
                winLine.forEach(idx => {
                    const cell = this.container.querySelector(`.cell[data-index="${idx}"]`);
                    if (cell) cell.classList.add('win');
                });
            }
        }
    }
}
