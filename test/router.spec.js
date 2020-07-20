import FormAttachmentList from '../src/components/form-attachment/list.vue';
import SubmissionList from '../src/components/submission/list.vue';
import i18n from '../src/i18n';
import testData from './data';
import { load, mockRoute } from './util/http';
import { loadLocale } from '../src/util/i18n';
import { mockLogin } from './util/session';
import { trigger } from './util/event';

describe('router', () => {
  describe.skip('i18n', () => {
    before(() => {
      const has = Object.prototype.hasOwnProperty.call(navigator, 'language');
      has.should.be.false();
    });
    afterEach(() => {
      delete navigator.language;
      return loadLocale('en');
    });

    const setLanguage = (locale) => {
      Object.defineProperty(navigator, 'language', {
        value: locale,
        configurable: true
      });
    };

    it("loads the user's preferred language", () => {
      setLanguage('es');
      return load('/login')
        .restoreSession(false)
        .afterResponses(() => {
          i18n.locale.should.equal('es');
        });
    });

    it('loads a less specific locale', () => {
      setLanguage('es-ES');
      return load('/login')
        .restoreSession(false)
        .afterResponses(() => {
          i18n.locale.should.equal('es');
        });
    });

    it('falls back to en for a locale that is not defined', () => {
      setLanguage('la');
      return load('/login')
        .restoreSession(false)
        .afterResponses(() => {
          i18n.locale.should.equal('en');
        });
    });

    it('loads the locale saved to local storage', () => {
      localStorage.setItem('locale', 'es');
      return load('/login')
        .restoreSession(false)
        .afterResponses(() => {
          i18n.locale.should.equal('es');
        });
    });

    it('only loads the locale before the first navigation', () => {
      setLanguage('es');
      return load('/login')
        .restoreSession(false)
        .afterResponses(() => {
          setLanguage('en');
        })
        .route('/reset-password')
        .then(() => {
          i18n.locale.should.equal('es');
        });
    });
  });

  describe('requireLogin', () => {
    const paths = [
      '/',
      '/projects/1',
      '/projects/1/users',
      '/projects/1/app-users',
      '/projects/1/form-access',
      '/projects/1/settings',
      '/projects/1/forms/f',
      '/projects/1/forms/f/versions',
      '/projects/1/forms/f/submissions',
      '/projects/1/forms/f/settings',
      '/projects/1/forms/f/draft',
      '/projects/1/forms/f/draft/attachments',
      '/projects/1/forms/f/draft/testing',
      '/users',
      // The redirect should pass through the query string and hash.
      '/users?x=y#z',
      '/users/2/edit',
      '/account/edit',
      '/system/backups',
      '/system/audits'
    ];

    for (const path of paths) {
      it(`redirects an anonymous user navigating to ${path}`, () =>
        mockRoute(path)
          .restoreSession(false)
          .afterResponse(app => {
            const { $route } = app.vm;
            $route.path.should.equal('/login');
            $route.query.next.should.equal(path);
          }));
    }
  });

  describe('requireAnonymity', () => {
    const paths = [
      '/login',
      '/reset-password',
      `/account/claim?token=${'a'.repeat(64)}`
    ];

    for (const path of paths) {
      it(`redirects a logged in user navigating to ${path}`, () => {
        mockLogin();
        return load('/account/edit')
          .complete()
          .route(path)
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          });
      });
    }
  });

  describe('preserveData', () => {
    describe('project routes', () => {
      it('preserves data if the user changes tabs', () => {
        mockLogin();
        testData.extendedProjects.createPast(1, { appUsers: 0 });
        return load('/projects/1/app-users')
          .complete()
          .route('/projects/1/settings')
          .complete()
          .route('/projects/1/app-users')
          .testNoRequest();
      });
    });
  });

  describe('validateData', () => {
    describe('user without a sitewide role', () => {
      beforeEach(() => {
        mockLogin({ role: 'none' });
      });

      it('redirects the user from /system/backups', () =>
        mockRoute('/system/backups')
          .respondFor('/', { users: false })
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects the user from /system/audits', () =>
        mockRoute('/system/audits')
          .respondFor('/', { users: false })
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));
    });

    describe('project viewer', () => {
      beforeEach(() => {
        mockLogin({ role: 'none' });

        testData.extendedProjects.createPast(1, { role: 'manager', forms: 1 });

        const project = testData.extendedProjects
          .createPast(1, { role: 'viewer', forms: 1, appUsers: 1 })
          .last();
        testData.extendedForms.createPast(1, { project });
        testData.extendedFormVersions.createPast(1, { draft: true });
        testData.standardFormAttachments.createPast(1);
      });

      describe('project routes', () => {
        describe('.../settings', () => {
          it('redirects a user whose first navigation is to the route', () =>
            load('/projects/1/settings')
              .respondFor('/', { users: false })
              .afterResponses(app => {
                app.vm.$route.path.should.equal('/');
              }));

          it('redirects a user navigating from a different project route', () =>
            load('/projects/1')
              .complete()
              .route('/projects/1/settings')
              .respondFor('/', { users: false })
              .afterResponse(app => {
                app.vm.$route.path.should.equal('/');
              }));

          it('redirects a user navigating from a different project', () =>
            load('/projects/1/settings', {}, {
              project: () => testData.extendedProjects.first()
            })
              .complete()
              .load('/projects/2/settings')
              .respondFor('/', { users: false })
              .afterResponses(app => {
                app.vm.$route.path.should.equal('/');
              }));
        });

        it('does not redirect the user from the project overview', async () => {
          const app = await load('/projects/1');
          app.vm.$route.path.should.equal('/projects/1');
        });

        it('redirects the user from .../users', () =>
          load('/projects/1/users', {}, { projectAssignments: 403.1 })
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects the user from .../app-users', () =>
          load('/projects/1/app-users', {}, { fieldKeys: 403.1 })
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects the user from .../form-access', () =>
          load('/projects/1/form-access', {}, {
            fieldKeys: 403.1,
            formSummaryAssignments: 403.1
          })
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));
      });

      describe('form routes', () => {
        it('redirects the user from the form overview', () =>
          load('/projects/1/forms/f', {}, { formActors: 403.1 })
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('does not redirect the user from .../versions', async () => {
          const app = await load('/projects/1/forms/f/versions');
          app.vm.$route.path.should.equal('/projects/1/forms/f/versions');
        });

        it('does not redirect the user from .../submissions', async () => {
          const app = await load('/projects/1/forms/f/submissions');
          app.vm.$route.path.should.equal('/projects/1/forms/f/submissions');
        });

        it('redirects the user from .../settings', () =>
          load('/projects/1/forms/f/settings')
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects the user from .../draft', () =>
          load('/projects/1/forms/f/draft')
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects the user from .../draft/attachments', () =>
          load('/projects/1/forms/f/draft/attachments')
            .respondFor('/', { users: false })
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('does not redirect the user from .../draft/testing', async () => {
          const app = await load('/projects/1/forms/f/draft/testing');
          app.vm.$route.path.should.equal('/projects/1/forms/f/draft/testing');
        });
      });
    });

    describe('Data Collector', () => {
      beforeEach(() => {
        mockLogin({ role: 'none' });
        testData.extendedProjects.createPast(1, { role: 'formfill', forms: 1 });
        testData.extendedForms.createPast(1);
        testData.extendedFormVersions.createPast(1, { draft: true });
        testData.standardFormAttachments.createPast(1);
      });

      describe('project routes', () => {
        it('does not redirect the user from the project overview', async () => {
          const app = await load('/projects/1');
          app.vm.$route.path.should.equal('/projects/1');
        });

        for (const path of [
          '/projects/1/users',
          '/projects/1/app-users',
          '/projects/1/form-access',
          '/projects/1/settings'
        ]) {
          it(`redirects the user from ${path}`, () =>
            load('/projects/1')
              .complete()
              .route(path)
              .respondFor('/', { users: false })
              .afterResponses(app => {
                app.vm.$route.path.should.equal('/');
              }));
        }
      });

      describe('form routes', () => {
        for (const path of [
          '/projects/1/forms/f',
          '/projects/1/forms/f/versions',
          '/projects/1/forms/f/submissions',
          '/projects/1/forms/f/settings',
          '/projects/1/forms/f/draft',
          '/projects/1/forms/f/draft/attachments',
          '/projects/1/forms/f/draft/testing'
        ]) {
          it(`redirects the user from ${path}`, () =>
            load('/projects/1')
              .complete()
              .route(path)
              .respondFor('/', { users: false })
              .afterResponses(app => {
                app.vm.$route.path.should.equal('/');
              }));
        }
      });
    });

    describe('form without a published version', () => {
      beforeEach(() => {
        mockLogin();
        testData.extendedProjects.createPast(1, { forms: 2 });
        testData.extendedForms
          .createPast(1, { xmlFormId: 'f2' })
          .createPast(1, { xmlFormId: 'f', draft: true });
      });

      describe('form overview', () => {
        it('redirects a user whose first navigation is to the route', () =>
          load('/projects/1/forms/f')
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects a user navigating from a different form route', () =>
          load('/projects/1/forms/f/draft')
            .complete()
            .route('/projects/1/forms/f')
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects a user navigating from a different form', () =>
          load('/projects/1/forms/f2', {}, {
            form: () => testData.extendedForms.first(),
            formDraft: 404.1,
            attachments: 404.1
          })
            .complete()
            .load('/projects/1/forms/f', { project: false })
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));
      });

      it('redirects the user from .../versions', () =>
        load('/projects/1/forms/f/versions', {}, { formVersions: () => [] })
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects the user from .../submissions', () =>
        load('/projects/1/forms/f/submissions')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects the user from .../settings', () =>
        load('/projects/1/forms/f/settings')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));
    });

    describe('form without a draft', () => {
      beforeEach(() => {
        mockLogin();
        testData.extendedProjects.createPast(1, { forms: 2 });
        testData.extendedForms
          .createPast(1, { xmlFormId: 'f2', draft: true })
          .createPast(1, { xmlFormId: 'f' });
      });

      describe('.../draft', () => {
        it('redirects a user whose first navigation is to the route', () =>
          load('/projects/1/forms/f/draft')
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects a user navigating from a different form route', () =>
          load('/projects/1/forms/f')
            .complete()
            .route('/projects/1/forms/f/draft')
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));

        it('redirects a user navigating from a different form', () =>
          load('/projects/1/forms/f2/draft', {}, {
            form: () => testData.extendedForms.first(),
            formDraft: () => testData.extendedFormDrafts.first(),
            attachments: () => [],
            formVersions: () => []
          })
            .complete()
            .load('/projects/1/forms/f/draft', { project: false })
            .respondFor('/')
            .afterResponses(app => {
              app.vm.$route.path.should.equal('/');
            }));
      });

      it('redirects the user from .../draft/attachments', () =>
        load('/projects/1/forms/f/draft/attachments')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects the user from .../draft/testing', () =>
        load('/projects/1/forms/f/draft/testing')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects user after a 404 for formDraft but a 200 for attachments', () =>
        load('/projects/1/forms/f/draft/attachments', {}, {
          attachments: () => testData.standardFormAttachments
            .createPast(1, { form: testData.extendedForms.last() })
            .sorted()
        })
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects user after a 200 for formDraft but a 404 for attachments', () =>
        load('/projects/1/forms/f2/draft', {}, {
          form: () => testData.extendedForms.first(),
          formDraft: () => testData.extendedFormDrafts.first(),
          attachments: 404.1,
          formVersions: () => []
        })
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));
    });

    describe('form draft without attachments', () => {
      beforeEach(() => {
        mockLogin();
        testData.extendedProjects.createPast(1, { forms: 2 });
        testData.extendedForms
          .createPast(1, { xmlFormId: 'f2', draft: true })
          .createPast(1, { xmlFormId: 'f', draft: true });
      });

      it('redirects a user whose first navigation is to the route', () =>
        load('/projects/1/forms/f/draft/attachments')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects a user navigating from a different form route', () =>
        load('/projects/1/forms/f/draft')
          .complete()
          .route('/projects/1/forms/f/draft/attachments')
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));

      it('redirects a user navigating from a different form', () =>
        load('/projects/1/forms/f2/draft/attachments', {}, {
          form: () => testData.extendedForms.first(),
          formDraft: () => testData.extendedFormDrafts.first(),
          attachments: () => testData.standardFormAttachments
            .createPast(1, { form: testData.extendedForms.first() })
            .sorted()
        })
          .complete()
          .load('/projects/1/forms/f/draft/attachments', {
            project: false,
            attachments: () => []
          })
          .respondFor('/')
          .afterResponses(app => {
            app.vm.$route.path.should.equal('/');
          }));
    });
  });

  describe('after a route update', () => {
    beforeEach(mockLogin);

    it('resets and updates SubmissionList', () =>
      mockRoute('/projects/1/forms/f1/submissions')
        .beforeEachResponse((app, { url }, index) => {
          if (index === 5)
            url.should.equal('/v1/projects/1/forms/f1/fields?odata=true');
        })
        .respondWithData(() => testData.extendedProjects
          .createPast(1, { forms: 3, lastSubmission: new Date().toISOString() })
          .last())
        .respondWithData(() => testData.extendedForms
          .createPast(1, { xmlFormId: 'f1', submissions: 1 })
          .last())
        .respondWithProblem(404.1) // formDraft
        .respondWithProblem(404.1) // attachments
        .respondWithData(() => testData.standardKeys.sorted())
        .respondWithData(() => testData.extendedForms.last()._fields)
        .respondWithData(() => {
          testData.extendedSubmissions.createPast(1);
          return testData.submissionOData(1, 0);
        })
        .afterResponses(app => {
          app.first(SubmissionList).data().submissions.length.should.equal(1);
        })
        .route('/projects/1/forms/f2/submissions')
        .beforeAnyResponse(app => {
          should.not.exist(app.first(SubmissionList).data().submissions);
        })
        .beforeEachResponse((app, { url }, index) => {
          if (index === 4)
            url.should.equal('/v1/projects/1/forms/f2/fields?odata=true');
        })
        .respondWithData(() => testData.extendedForms
          .createPast(1, { xmlFormId: 'f2', submissions: 2 })
          .last())
        .respondWithProblem(404.1) // formDraft
        .respondWithProblem(404.1) // attachments
        .respondWithData(() => testData.standardKeys.sorted())
        .respondWithData(() => testData.extendedForms.last()._fields)
        .respondWithData(() => {
          const form = testData.extendedForms.last();
          testData.extendedSubmissions.createPast(2, { form });
          return testData.submissionOData(2, 1);
        })
        .afterResponses(app => {
          app.first(SubmissionList).data().submissions.length.should.equal(2);
        }));

    it('resets FormAttachmentList', () =>
      mockRoute('/projects/1/forms/f1/draft/attachments')
        .respondWithData(() =>
          testData.extendedProjects.createPast(1, { forms: 2 }).last())
        .respondWithData(() => testData.extendedForms
          .createPast(1, { xmlFormId: 'f1', draft: true })
          .last())
        .respondWithData(() => testData.extendedFormDrafts.last())
        .respondWithData(() =>
          testData.standardFormAttachments.createPast(1).sorted())
        .afterResponses(app =>
          trigger.dragAndDrop(app, FormAttachmentList, [new File([''], 'a')])
            .then(() => {
              const { unmatchedFiles } = app.first(FormAttachmentList).data();
              unmatchedFiles.length.should.equal(1);
            }))
        .route('/projects/1/forms/f2/draft/attachments')
        .respondWithData(() => testData.extendedForms
          .createPast(1, { xmlFormId: 'f2', draft: true })
          .last())
        .respondWithData(() => testData.extendedFormDrafts.last())
        .respondWithData(() => [
          testData.standardFormAttachments
            .createPast(1, {
              form: testData.extendedForms.last(),
              hasUpdatedAt: false
            })
            .last()
        ])
        .afterResponses(app => {
          const { unmatchedFiles } = app.first(FormAttachmentList).data();
          unmatchedFiles.length.should.equal(0);
        }));
  });
});
