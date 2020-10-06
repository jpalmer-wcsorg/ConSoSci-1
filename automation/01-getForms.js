get('https://kf.kobotoolbox.org/api/v2/assets/?format=json', {}, state => {
  console.log(`Previous cursor: ${state.lastEnd}`);
  // Set a manual cursor if you'd like to only fetch form after a certain date
  const manualCursor = '2019-05-25T14:32:43.325+01:00';
  state.data.forms = state.data.results
    .filter(resource => resource.date_modified > (state.lastEnd || manualCursor))
    .map(form => {
      const url = form.url.split('?').join('?');
      return {
        formId: form.uid,
        tag: form.name,
        url,
      };
    });

  const lastEnd = state.data.results
    .filter(item => item.date_modified)
    .map(s => s.date_modified)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  console.log(`Forms to fetch: ${JSON.stringify(state.data.forms, null, 2)}`);

  return { ...state, lastEnd, forms: [] };
});

each(
  // for each form that has been created/updated since the last run...
  dataPath('forms[*]'),
  // get the form definition...
  state =>
    get(`${state.data.url}`, {}, state => {
      const { survey } = state.data.content;

      const mapType = {
        decimal: 'float4',
        integer: 'int4',
        text: 'text',
        select_one: 'varchar',
        calculate: 'varchar',
        date: 'date',
      };

      const types = ['integer', 'text', 'decimal', 'select_one', 'date', 'calculate'];

      function map_question_to_valid_type(questions) {
        var form = questions.filter(elt => types.includes(elt.type));
        form.forEach(obj => (obj.type = mapType[obj.type]));
        form.forEach(obj => {
          if (obj.name === 'group') {
            obj.name = 'kobogroup';
          }
        });
        form = form
          .map(x => {
            if (x.name !== undefined) {
              x.name = x.name.split(/-/).join('_');
            }
            return x;
          })
          .filter(x => x.name !== undefined);

        return form;
      }

      function extract_tables_from_questions_array(questions, formName, tables) {
        var index_begin = -1;
        var index_end = -1;

        questions.find((item, i) => {
          if (item.type === 'begin_repeat') {
            index_begin = i;
          }
          if (item.type === 'end_repeat') index_end = i;
        });

        if (-1 !== (index_begin | index_end)) {
          const group = questions.splice(index_begin, index_end - index_begin + 1);
          tables.push({
            name: (formName + '_' + questions[index_begin].name).split(/\s|-/).join('_').toLowerCase(),
            columns: map_question_to_valid_type(group),
            formDef: group
          });
          return extract_tables_from_questions_array(questions, formName, tables);
        }
        tables.push({
          name: formName.split(/\s|-/).join('_').toLowerCase(),
          columns: map_question_to_valid_type(questions),
          formDef: questions
        });
        return tables;
      }

      const tables = extract_tables_from_questions_array(survey, state.data.name, []);

      return {
        ...state,
        forms: [...state.forms, tables],
      };
    })(state)
);
