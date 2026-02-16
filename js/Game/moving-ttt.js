
class MovingTTT {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.phase = 'placement'; // 'placement' or 'movement'
        this.piecesCount = { 'X': 0, 'O': 0 };
        this.selectedCell = null;
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
            if (room.board_state) {
                this.board = room.board_state.board;
                this.phase = room.board_state.phase;
                this.piecesCount = room.board_state.piecesCount;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'X' ? 'O' : 'X');
                this.updateBoardUI();
                this.checkWinCondition(false);
            }
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="moving-board">
                ${this.board.map((cell, index) => `
                    <div class="cell" data-index="${index}" onclick="currentGame.handleCellClick(${index})">
                        ${cell || ''}
                    </div>
                `).join('')}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .moving-board {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                width: 300px;
                height: 300px;
                margin: 0 auto;
            }
            .cell {
                background: rgba(255, 255, 255, 0.15);
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2.5rem;
                cursor: pointer;
                transition: background 0.2s;
            }
            .cell:hover {
                background: rgba(255, 255, 255, 0.25);
            }
            .cell.x { color: #fca5a5; text-shadow: 0 0 10px rgba(252, 165, 165, 0.4); }
            .cell.o { color: #93c5fd; text-shadow: 0 0 10px rgba(147, 197, 253, 0.4); }
            .cell.selected {
                background: rgba(255, 255, 255, 0.4);
                border-color: #f59e0b; /* Amber for selection */
            }
            .cell.highlight-move {
                background: rgba(34, 197, 94, 0.2); /* Green tint */
                cursor: pointer;
                box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.4);
            }
            .cell.win { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; }
        `;
        this.container.appendChild(style);
        this.updateStatus();
    }

    updateBoardUI() {
        const cells = this.container.querySelectorAll('.cell');
        this.board.forEach((cell, i) => {
            const el = cells[i];
            el.innerText = cell || '';
            el.className = `cell ${cell ? cell.toLowerCase() : ''}`;
            if (this.selectedCell === i) el.classList.add('selected');
        });

        // Highlight possible moves logic is handled in click handler visual feedback mostly, 
        // but we can add 'highlight-move' class if selected.
        if (this.selectedCell !== null) {
            const validMoves = this.getValidMoves(this.selectedCell);
            validMoves.forEach(idx => cells[idx].classList.add('highlight-move'));
        }

        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) return;

        let msg = '';
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            msg = isMyTurn ? 'دورك: ' : 'دور الخصم: ';
        } else {
            msg = `الدور: ${this.currentPlayer} `;
        }

        if (this.phase === 'placement') {
            msg += `(وضع القطع ${this.piecesCount[this.currentPlayer]}/3)`;
        } else {
            msg += '(تحريك القطع)';
            if (this.selectedCell !== null) msg += ' - اختر وجهة';
            else msg += ' - اختر قطعة';
        }

        statusEl.innerText = msg;
    }

    async handleCellClick(index) {
        if (this.gameOver) return;

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            if (!isMyTurn) return;
        }

        if (this.phase === 'placement') {
            if (this.board[index] !== null) return; // Occupied

            this.makePlacement(index, this.currentPlayer);

            // Switch Turn or Phase Logic
            if (this.piecesCount['X'] === 3 && this.piecesCount['O'] === 3) {
                this.phase = 'movement';
            }

            // Normal turn switch during placement
            this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';

            this.sendOnlineUpdate();
            this.updateBoardUI();

            if (this.config.mode === 'ai' && this.currentPlayer === 'O') { // AI is O
                setTimeout(() => this.makeAiMove(), 500);
            }

        } else { // Movement Phase
            // 1. Select piece
            if (this.board[index] === this.currentPlayer) {
                this.selectedCell = index;
                this.updateBoardUI();
                return;
            }

            // 2. Move selected piece
            if (this.selectedCell !== null && this.board[index] === null) {
                // Check valid move (orthogonal, distance 1)
                if (this.isValidMove(this.selectedCell, index)) {
                    this.makeMove(this.selectedCell, index, this.currentPlayer);

                    if (this.checkWinCondition()) {
                        this.sendOnlineUpdate();
                        return;
                    }

                    this.selectedCell = null;
                    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
                    this.sendOnlineUpdate();
                    this.updateBoardUI();

                    if (this.config.mode === 'ai' && this.currentPlayer === 'O') {
                        setTimeout(() => this.makeAiMove(), 500);
                    }
                } else {
                    // Invalid move attempt
                    // Maybe deselect?
                    this.selectedCell = null;
                    this.updateBoardUI();
                }
            }
        }
    }

    isValidMove(from, to) {
        const rowFrom = Math.floor(from / 3);
        const colFrom = from % 3;
        const rowTo = Math.floor(to / 3);
        const colTo = to % 3;

        const dRow = Math.abs(rowFrom - rowTo);
        const dCol = Math.abs(colFrom - colTo);

        // Orthogonal means (dRow 1, dCol 0) OR (dRow 0, dCol 1)
        return (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
    }

    getValidMoves(from) {
        if (from === null) return [];
        // Check all 4 neighbors
        const neighbors = [];
        const row = Math.floor(from / 3);
        const col = from % 3;

        if (row > 0) neighbors.push(from - 3);
        if (row < 2) neighbors.push(from + 3);
        if (col > 0) neighbors.push(from - 1);
        if (col < 2) neighbors.push(from + 1);

        return neighbors.filter(idx => this.board[idx] === null);
    }

    makePlacement(index, player) {
        this.board[index] = player;
        this.piecesCount[player]++;
    }

    makeMove(from, to, player) {
        this.board[from] = null;
        this.board[to] = player;
    }

    sendOnlineUpdate() {
        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                { board: this.board, phase: this.phase, piecesCount: this.piecesCount },
                null, // Turn logic handled by changing currentPlayer logic on client for now, but usually needs server coordination
                { from: this.selectedCell, to: null } // Simplified
            );
        }
    }

    makeAiMove() {
        if (this.phase === 'placement') {
            const emptyCells = this.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
            const moveIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            this.makePlacement(moveIndex, this.currentPlayer);

            if (this.piecesCount['X'] === 3 && this.piecesCount['O'] === 3) {
                this.phase = 'movement';
            }
        } else {
            // Movement phase AI
            const myPieces = this.board.map((v, i) => v === this.currentPlayer ? i : null).filter(v => v !== null);
            // Find all possible moves
            let allMoves = [];
            myPieces.forEach(from => {
                const targets = this.getValidMoves(from);
                targets.forEach(to => {
                    allMoves.push({ from, to });
                });
            });

            if (allMoves.length > 0) {
                // Try to find a winning move
                const winningMove = allMoves.find(m => {
                    this.board[m.from] = null;
                    this.board[m.to] = this.currentPlayer;
                    const wins = this.checkWinCondition(false);
                    // Undo
                    this.board[m.from] = this.currentPlayer;
                    this.board[m.to] = null;
                    return wins;
                });

                const move = winningMove || allMoves[Math.floor(Math.random() * allMoves.length)];
                this.makeMove(move.from, move.to, this.currentPlayer);

                if (this.checkWinCondition()) return;
            }
        }

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateBoardUI();
    }

    checkWinCondition(triggerUI = true) {
        if (this.phase === 'placement') return false; // Rule: No win in placement

        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        const winnerLines = lines.filter(line => line.every(i => this.board[i] === this.currentPlayer));

        if (winnerLines.length > 0) {
            if (triggerUI) this.endGame(this.currentPlayer, winnerLines[0]);
            return true;
        }

        return false;
    }

    endGame(winner, winLine) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        statusEl.innerText = `المنتصر: ${winner}!`;
        if (winLine) {
            winLine.forEach(idx => {
                const cell = this.container.querySelector(`.cell[data-index="${idx}"]`);
                if (cell) cell.classList.add('win');
            });
        }
    }
}
