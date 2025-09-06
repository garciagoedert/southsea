export default class HistoryManager {
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        this.history = [];
        this.pointer = -1;
    }

    add(action) {
        // If we are in the middle of the history, clear the future
        if (this.pointer < this.history.length - 1) {
            this.history.splice(this.pointer + 1);
        }

        this.history.push(action);

        // Keep history size in check
        if (this.history.length > this.maxSize) {
            this.history.shift();
        }

        this.pointer = this.history.length - 1;
    }

    undo() {
        if (this.canUndo()) {
            const action = this.history[this.pointer];
            this.pointer--;
            return action.undo;
        }
        return null;
    }

    redo() {
        if (this.canRedo()) {
            this.pointer++;
            const action = this.history[this.pointer];
            return action.redo;
        }
        return null;
    }

    canUndo() {
        return this.pointer >= 0;
    }

    canRedo() {
        return this.pointer < this.history.length - 1;
    }

    clear() {
        this.history = [];
        this.pointer = -1;
    }
}
