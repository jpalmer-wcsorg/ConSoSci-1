get(`${state.data.url}`, {}, state => {
  const { survey } = state.data.content;
  // PREFIX HANDLER
  const prefix1 = state.references[0].prefix1 || 'WCS';
  const prefix2 = state.references[0].prefix2 || 'FormGroup';
  const tableId = state.references[0].tableId;
  const uuid = 'GeneratedUuid';
  // END OF PREFIX HANDLER

  // TODO: Decide which metadata field to include. ========================
  //survey.push({ name: 'generated_uuid', type: 'text' });
  // ======================================================================

  const mapType = {
    calculate: 'varchar',
    date: 'date',
    decimal: 'float4',
    end: 'date',
    integer: 'int4',
    select_one: 'varchar',
    start: 'date',
    text: 'text',
    today: 'date',
    jsonb: 'jsonb',
    select_multiple: 'text',
    geopoint: 'text',
  };

  const discards = [
    'begin_group',
    'begin_repeat',
    'end_group',
    'end_repeat',
    'note',
  ];

  // Camelize columns and table name
  function toCamelCase(str) {
    const words = str.match(/[0-9a-zA-Z\u00C0-\u00FF]+/gi);
    if (!words) return '';
    return words
      .map(word => {
        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
      })
      .join('');
  }

  function questionToType(questions) {
    var form = questions.filter(elt => !discards.includes(elt.type));
    form.forEach(obj => (obj.type = mapType[obj.type] || 'text'));
    form.forEach(obj => {
      // At some point we might need a list of 'question' that should be renamed, and their new values.
      // List of reserved keys in postgresql
      if (obj.name === 'group') {
        obj.name = 'kobogroup';
      }
      if (obj.name == 'end') {
        obj.name = 'end_date';
      }
      if (obj.name == 'column') {
        obj.name = 'column_name';
      }
      if (obj.name == 'date') {
        obj.name = 'date_value';
      }
    });
    form = form.map(x => {
      const name = x.name || x.$autoname;
      return {
        ...x,
        name: `${name.split(/-/).join('_')}`,
        required: false,
      };
    });

    const parentColumn =
      questions[0].path.length > 1
        ? `${questions[0].path.slice(-2, -1)[0]}_uuid`
        : `${tableId}_uuid`;

    if (questions[0].depth > 0) form.push({ name: parentColumn, type: 'text' });

    form.push(
      // Adding a column as jsonb to take the whole payload
      { name: 'Payload', type: 'jsonb' },
      { name: uuid, type: 'text', unique: true }
    );

    return form;
  }

  function tablesFromQuestions(questions, formName, tables) {
    const backwardsFirstBegin = questions
      .reverse()
      .findIndex(item => item.type === 'begin_repeat');

    const lastBegin =
      backwardsFirstBegin !== -1
        ? questions.length - backwardsFirstBegin - 1
        : false;

    if (lastBegin) {
      const firstEndAfterLastBegin =
        questions
          .reverse()
          .slice(lastBegin)
          .findIndex(item => item.type === 'end_repeat') + lastBegin;

      // Remove the deepest repeat group from the 'questions' array, parse it
      // and push it to the 'tables' array, and call tablesFromQuestions with
      // the remaining questions.
      const group = questions.splice(
        lastBegin,
        firstEndAfterLastBegin - lastBegin + 1
      );

      const name =
        `${prefix1}_${prefix2}_${tableId}_` +
        toCamelCase(
          group[0].path
            .slice(-1)
            .pop()
            .split(/\s|-|'/)
            .join('_')
            .replace('.', '')
        );

      tables.push({
        name,
        columns: questionToType(group),
        formName,
        depth: group[0].depth,
      });

      return tablesFromQuestions(questions, formName, tables);
    }

    tables.push(
      {
        name: `${prefix1}_${prefix2}_${tableId}`,
        columns: questionToType(questions),
        formName,
        depth: 0,
      },
      {
        name: `${prefix1}__KoboDataset`,
        columns: [
          {
            name: 'FormName',
            type: 'text',
            depth: 0,
            path: [],
          },
          {
            name: 'DatasetId',
            type: 'text',
            depth: 0,
            path: [],
            unique: true,
          },
          {
            name: 'LastUpdated',
            type: 'timestamp',
            depth: 0,
            path: [],
          },
          {
            name: 'Payload',
            type: 'jsonb',
            depth: 0,
            path: [],
          },
        ],
        formName,
        depth: 0,
      }
    );

    return tables;
  }

  let depth = 0;

  survey.forEach((q, i, arr) => {
    switch (q.type) {
      case 'begin_group':
        arr[i] = {
          ...q,
          depth,
          path: i === 0 ? [] : [...arr[i - 1].path, q.name],
        };
        break;

      case 'begin_repeat':
        depth++;
        arr[i] = {
          ...q,
          depth,
          path: i === 0 ? [] : [...arr[i - 1].path, q.name],
        };
        break;

      case 'end_repeat':
        arr[i] = {
          ...q,
          depth,
          path: i === 0 ? [] : [...arr[i - 1].path.slice(0, -1)],
        };
        depth--;
        break;

      case 'end_group':
        arr[i] = {
          ...q,
          depth,
          path: i === 0 ? [] : [...arr[i - 1].path.slice(0, -1)],
        };
        break;

      default:
        arr[i] = {
          ...q,
          depth,
          path: i === 0 ? [] : [...arr[i - 1].path],
        };
        break;
    }
  });

  const tables = tablesFromQuestions(survey, state.data.name, []).reverse();

  return {
    ...state,
    forms: [tables],
    prefix1,
    prefix2,
    uuid,
    tableId,
  };
});
