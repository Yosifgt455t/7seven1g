
class MisereTTT {
    constructor(container, config) {
        this.container = container;
        this.config = config; // { mode: 'local'|'ai'|'online', difficulty: 'easy'|'medium', roomCode, playerId, role }
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X'; // X always starts logic-wise, but we manage turns
        this.gameOver = false;
        this.winningLine = null;

        // Online state
        this.roomCode = config.roomCode;
        this.myRole = config.role; // 'player1' -> 'X', 'player2' -> 'O' (usually)
        this.mySymbol = this.myRole === 'player2' ? 'O' : 'X';

        this.init();
    }

    init() {
        this.render();

        if (this.config.mode === 'online') {
            this.setupOnlineListeners();
        } else if (this.config.mode === 'ai' && this.currentPlayer !== 'X') {
            // If AI starts? Usually player starts. Let's assume Player is always X for now in AI mode.
        }
    }

    setupOnlineListeners() {
        SupabaseClient.subscribeToRoom(this.roomCode, (room) => {
            if (room.board_state && room.board_state.board) {
                this.board = room.board_state.board;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'X' ? 'O' : 'X');
                this.updateBoardUI();
                this.checkWinCondition(false); // Check silently to update UI state
            }
        });
    }

    render() {
        // Create the board UI
        this.container.innerHTML = `
            <div class="misere-board">
                ${this.board.map((cell, index) => `
                    <div class="cell" data-index="${index}" onclick="currentGame.handleCellClick(${index})">
                        ${cell || ''}
                    </div>
                `).join('')}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        // Add specific styles if needed, or rely on global
        const style = document.createElement('style');
        style.innerHTML = `
            .misere-board {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                width: 300px;
                height: 300px;
                margin: 0 auto;
            }
            .cell {
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2.5rem;
                cursor: pointer;
                transition: background 0.2s;
            }
            .cell:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .cell.x { color: #ef4444; } /* Red for X */
            .cell.o { color: #3b82f6; } /* Blue for O */
            .cell.win { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; } /* Loser highlight */
        `;
        this.container.appendChild(style);
        this.updateStatus();
    }

    updateBoardUI() {
        const cells = this.container.querySelectorAll('.cell');
        this.board.forEach((cell, i) => {
            cells[i].innerText = cell || '';
            cells[i].className = `cell ${cell ? cell.toLowerCase() : ''}`;
        });
        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) {
            // In Misere, the one who completes the line LOSES.
            // So if winningLine exists, currentPlayer (who made the move) LOST.
            // But logic: checkWin sets gameOver. 
            // If I just moved and completed a line -> I lose. 
            // The previous player was 'this.currentPlayer' before toggle? 
            // Let's rely on handleCellClick logic.
            return;
        }

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

        // Online check
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            if (!isMyTurn) return;
        }

        this.makeMove(index, this.currentPlayer);

        if (this.checkWinCondition()) return;

        // Switch turn
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();

        // Online Sync
        if (this.config.mode === 'online') {
            const nextTurnId = this.currentPlayer === 'X' ?
                (this.myRole === 'player1' ? this.config.playerId : null) : // Should be opponent ID
                (this.myRole === 'player2' ? this.config.playerId : null);
            // Wait, supabase-client handles nextTurn logic slightly differently? 
            // Ideally we send 'next turn is opponent'. 
            // Simplified: we send the board, and who should play next.
            // We need opponent ID. For now let's just send the text 'X' or 'O' in board_state check?
            // Actually, allow client wrapper to handle ID resolution if we pass "other".
            // Let's just update the board state in DB.
            SupabaseClient.sendMove(
                this.roomCode,
                { board: this.board },
                null, // Trigger update, logic elsewhere handles turn ID if needed, or we rely on client deriving turn from board count? No, explicit is better.
                { index, player: this.board[index] }
            );
            // NOTE: The server schema uses UUID for turn. We might need to fetch opponent UUID.
            // For this demo, let's rely on the subscribe event to switch turns for the OTHER player.
            // But we need to update the DB so *that* player knows it's their turn.
            // We'll skip complex UUID logic for now and assume clients trust the sequence.
        }

        // AI Turn
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
        if (this.config.difficulty === 'easy') {
            moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        } else {
            // Medium: Avoid losing if possible.
            // "Lose" means creating a line of 3 for self.
            // So check if any move CREATES a line of 3 for current player (AI).
            const safeMoves = availableMoves.filter(idx => !this.checkIfMoveLoses(idx, this.currentPlayer));

            if (safeMoves.length > 0) {
                moveIndex = safeMoves[Math.floor(Math.random() * safeMoves.length)];
            } else {
                // Must lose
                moveIndex = availableMoves[0];
            }
        }

        this.makeMove(moveIndex, this.currentPlayer);

        if (this.checkWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();
    }

    checkIfMoveLoses(index, player) {
        // Simulate move
        this.board[index] = player;
        const loses = this.hasLine(player);
        this.board[index] = null; // Undo
        return loses;
    }

    hasLine(player) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]           // Diagonals
        ];
        return lines.some(line => line.every(i => this.board[i] === player));
    }

    checkWinCondition(triggerUI = true) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]           // Diagonals
        ];

        // Check if CURRENT player just made a line -> THEY LOSE
        // The last mover is the one we usually check.
        // In handleClick, we called makeMove(current).

        // Find if 'X' has a line
        const xLost = lines.find(line => line.every(i => this.board[i] === 'X'));
        if (xLost) {
            if (triggerUI) this.endGame('O', xLost); // X made line -> O wins
            return true;
        }

        // Find if 'O' has a line
        const oLost = lines.find(line => line.every(i => this.board[i] === 'O'));
        if (oLost) {
            if (triggerUI) this.endGame('X', oLost); // O made line -> X wins
            return true;
        }

        // Check Draw
        if (!this.board.includes(null)) {
            if (triggerUI) this.endGame('draw');
            return true;
        }

        return false;
    }

    endGame(winner, losingLine) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');

        if (winner === 'draw') {
            statusEl.innerText = 'تعادل!';
            statusEl.style.color = '#cbd5e1';
        } else {
            statusEl.innerText = `الفائز هو ${winner}!`;
            statusEl.style.color = '#22c55e';

            // Highlight losing line to show WHY they lost
            if (losingLine) {
                const cells = this.container.querySelectorAll('.cell');
                losingLine.forEach(i => cells[i].classList.add('win')); // Reuse 'win' style for emphasis
            }
        }
    }
}
