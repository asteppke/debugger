// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd } from '@jupyterlab/application';

import { MainAreaWidget, WidgetTracker } from '@jupyterlab/apputils';

import {
  CodeEditor,
  CodeEditorWrapper,
  IEditorServices
} from '@jupyterlab/codeeditor';

import { IConsoleTracker } from '@jupyterlab/console';

import { IEditorTracker } from '@jupyterlab/fileeditor';

import { INotebookTracker } from '@jupyterlab/notebook';

import { chain, each, IIterator } from '@lumino/algorithm';

import { Token } from '@lumino/coreutils';

import { IDisposable } from '@lumino/disposable';

import { Signal } from '@lumino/signaling';

import { IDebugger } from './tokens';

/**
 * A class to find instances of code editors across notebook, console and files widgets
 */
export class EditorFinder implements IDisposable, IDebuggerEditorFinder {
  /**
   * Instantiate a new EditorFinder.
   *
   * @param options The instantiation options for a EditorFinder.
   */
  constructor(options: EditorFinder.IOptions) {
    this._shell = options.shell;
    this._service = options.service;
    this._notebookTracker = options.notebookTracker;
    this._consoleTracker = options.consoleTracker;
    this._editorTracker = options.editorTracker;
    this._readOnlyEditorTracker = new WidgetTracker<
      MainAreaWidget<CodeEditorWrapper>
    >({
      namespace: '@jupyterlab/debugger'
    });
  }

  /**
   * Whether the handler is disposed.
   */
  isDisposed: boolean;

  /**
   * Dispose the handler.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Find the editor for a source matching the current debug session
   * by iterating through all the widgets in each of the notebook,
   * console, file editor, and read-only file editor trackers.
   *
   * @param debugSessionPath The path for the current debug session.
   * @param source The source to find.
   */
  find(
    debugSessionPath: string,
    source: string
  ): IIterator<CodeEditor.IEditor> {
    return chain(
      this._findInNotebooks(debugSessionPath, source),
      this._findInConsoles(debugSessionPath, source),
      this._findInEditors(debugSessionPath, source),
      this._findInReadOnlyEditors(debugSessionPath, source)
    );
  }

  /**
   * Find the editor for a source matching the current debug session
   *
   * @param debugSessionPath The path for the current debug session.
   * @param source The source to find.
   */
  private _findInNotebooks(
    debugSessionPath: string,
    source: string
  ): CodeEditor.IEditor[] {
    if (!this._notebookTracker) {
      return [];
    }
    const editors: CodeEditor.IEditor[] = [];
    this._notebookTracker.forEach(notebookPanel => {
      const sessionContext = notebookPanel.sessionContext;

      if (sessionContext.path !== debugSessionPath) {
        return;
      }

      const notebook = notebookPanel.content;
      notebook.mode = 'command';
      const cells = notebookPanel.content.widgets;
      cells.forEach((cell, i) => {
        // check the event is for the correct cell
        const code = cell.model.value.text;
        const cellId = this._service.getCodeId(code);
        if (source !== cellId) {
          return;
        }
        notebook.activeCellIndex = i;
        const rect = notebook.activeCell.inputArea.node.getBoundingClientRect();
        notebook.scrollToPosition(rect.bottom, 45);
        editors.push(cell.editor);
        this._shell.activateById(notebookPanel.id);
      });
    });
    return editors;
  }

  /**
   * Find the editor for a source matching the current debug session
   *
   * @param debugSessionPath The path for the current debug session.
   * @param source The source to find.
   */
  private _findInConsoles(
    debugSessionPath: string,
    source: string
  ): CodeEditor.IEditor[] {
    if (!this._consoleTracker) {
      return [];
    }
    const editors: CodeEditor.IEditor[] = [];
    this._consoleTracker.forEach(consoleWidget => {
      const sessionContext = consoleWidget.sessionContext;

      if (sessionContext.path !== debugSessionPath) {
        return;
      }

      const cells = consoleWidget.console.cells;
      each(cells, cell => {
        const code = cell.model.value.text;
        const codeId = this._service.getCodeId(code);
        if (source !== codeId) {
          return;
        }
        editors.push(cell.editor);
        this._shell.activateById(consoleWidget.id);
      });
    });
    return editors;
  }

  /**
   * Find the editor for a source matching the current debug session
   * from the editor tracker.
   *
   * @param debugSessionPath The path for the current debug session.
   * @param source The source to find.
   */
  private _findInEditors(
    debugSessionPath: string,
    source: string
  ): CodeEditor.IEditor[] {
    if (!this._editorTracker) {
      return;
    }
    const editors: CodeEditor.IEditor[] = [];
    this._editorTracker.forEach(doc => {
      const fileEditor = doc.content;
      if (debugSessionPath !== fileEditor.context.path) {
        return;
      }

      const editor = fileEditor.editor;
      if (!editor) {
        return;
      }

      const code = editor.model.value.text;
      const codeId = this._service.getCodeId(code);
      if (source !== codeId) {
        return;
      }
      editors.push(editor);
      this._shell.activateById(doc.id);
    });
    return editors;
  }

  /**
   * Find an editor for a source from the read-only editor tracker.
   *
   * @param debugSessionPath The path for the current debug session.
   * @param source The source to find.
   */
  private _findInReadOnlyEditors(
    debugSessionPath: string,
    source: string
  ): CodeEditor.IEditor[] {
    const editors: CodeEditor.IEditor[] = [];
    this._readOnlyEditorTracker.forEach(widget => {
      const editor = widget.content?.editor;
      if (!editor) {
        return;
      }

      const code = editor.model.value.text;
      const codeId = this._service.getCodeId(code);
      if (widget.title.caption !== source && source !== codeId) {
        return;
      }
      editors.push(editor);
      this._shell.activateById(widget.id);
    });
    return editors;
  }
  private _service: IDebugger;
  private _shell: JupyterFrontEnd.IShell;
  private _readOnlyEditorTracker: WidgetTracker<
    MainAreaWidget<CodeEditorWrapper>
  >;
  private _notebookTracker: INotebookTracker | null;
  private _consoleTracker: IConsoleTracker | null;
  private _editorTracker: IEditorTracker | null;
}
/**
 * A namespace for editor finder statics.
 */
export namespace EditorFinder {
  /**
   * The options used to initialize a EditorFinder object.
   */
  export interface IOptions {
    /**
     * An optional editor finder for consoles.
     */
    consoleTracker?: IConsoleTracker;

    /**
     * The editor services.
     */
    editorServices: IEditorServices;

    /**
     * An optional editor finder for file editors.
     */
    editorTracker?: IEditorTracker;

    /**
     * An optional editor finder for notebooks.
     */
    notebookTracker?: INotebookTracker;

    /**
     * The debugger service.
     */
    service: IDebugger;

    /**
     * The application shell.
     */
    shell: JupyterFrontEnd.IShell;
  }
  /**
   * A token for a editor finder handler find method plugin
   *
   */
}
export const IDebuggerEditorFinder = new Token<IDebuggerEditorFinder>(
  '@jupyterlab/debugger:editor-finder'
);
/**
 * Interface for separated find method from editor finder plugin
 */
export interface IDebuggerEditorFinder {
  find(debugSessionPath: string, source: string): IIterator<CodeEditor.IEditor>;
}
