import React from 'react';
import { UserRound } from 'lucide-react';
import { useData } from '../../context/DataContext';

const schoolTagOptions = ['985', '211', '双一流', 'C9', '普通本科'];
const inputClassName =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50';

const Field = ({ label, children }) => (
  <label className="block space-y-2">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    {children}
  </label>
);

const ProfileHeader = () => {
  const { studentData, setStudentData } = useData();
  const bi = studentData.basicInfo || {};
  const em = studentData.explicitMetrics || {};
  const tags = Array.isArray(em.schoolTags) ? em.schoolTags : [];

  const updateBasicInfo = (key, value) => {
    setStudentData({
      ...studentData,
      basicInfo: {
        ...bi,
        [key]: value,
      },
    });
  };

  const updateExplicitMetrics = (key, value) => {
    setStudentData({
      ...studentData,
      explicitMetrics: {
        ...em,
        [key]: value,
      },
    });
  };

  const toggleSchoolTag = (tag) => {
    const nextTags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
    updateExplicitMetrics('schoolTags', nextTags);
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_20px_60px_rgba(59,130,246,0.08)]">
      <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserRound size={20} />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">基础信息</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">补充身份、教育背景和联系信息。</p>
          </div>

          <p className="text-xs font-medium text-slate-400">这些内容会用于简历预览与后续评估。</p>
        </div>
      </div>

      <div className="space-y-8 px-6 py-6 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="姓名">
            <input
              value={bi.name || ''}
              onChange={(event) => updateBasicInfo('name', event.target.value)}
              placeholder="填写姓名"
              className={inputClassName}
            />
          </Field>

          <Field label="手机号">
            <input
              value={bi.phone || ''}
              onChange={(event) => updateBasicInfo('phone', event.target.value)}
              placeholder="填写手机号"
              className={inputClassName}
            />
          </Field>

          <Field label="邮箱">
            <input
              value={bi.email || ''}
              onChange={(event) => updateBasicInfo('email', event.target.value)}
              placeholder="填写邮箱"
              className={inputClassName}
            />
          </Field>

          <Field label="学生编号">
            <div className={`${inputClassName} flex items-center bg-slate-50 text-slate-500`}>
              {studentData.student_id || '系统生成'}
            </div>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="学校">
            <input
              value={bi.schoolName || ''}
              onChange={(event) => updateBasicInfo('schoolName', event.target.value)}
              placeholder="填写学校名称"
              className={inputClassName}
            />
          </Field>

          <Field label="专业">
            <input
              value={bi.schoolMajor || ''}
              onChange={(event) => updateBasicInfo('schoolMajor', event.target.value)}
              placeholder="填写专业名称"
              className={inputClassName}
            />
          </Field>

          <Field label="学历">
            <select
              value={bi.educationLevel || '本科'}
              onChange={(event) => updateBasicInfo('educationLevel', event.target.value)}
              className={inputClassName}
            >
              {['专科', '本科', '硕士', '博士'].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>

          <Field label="毕业省份">
            <input
              value={bi.graduationProvince || ''}
              onChange={(event) => updateBasicInfo('graduationProvince', event.target.value)}
              placeholder="例如 上海"
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="毕业年份">
            <input
              type="number"
              value={bi.graduationYear || ''}
              onChange={(event) => updateBasicInfo('graduationYear', parseInt(event.target.value, 10) || '')}
              placeholder="例如 2027"
              className={inputClassName}
            />
          </Field>

          <Field label="毕业月份">
            <input
              type="number"
              value={bi.graduationMonth || ''}
              onChange={(event) => updateBasicInfo('graduationMonth', parseInt(event.target.value, 10) || '')}
              placeholder="例如 6"
              className={inputClassName}
            />
          </Field>

          <Field label="毕业城市">
            <input
              value={em.graduationCity || ''}
              onChange={(event) => updateExplicitMetrics('graduationCity', event.target.value)}
              placeholder="例如 杭州"
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">学校标签</h3>
            <p className="mt-1 text-sm text-slate-500">按实际情况选择即可。</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {schoolTagOptions.map((tag) => {
              const isActive = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleSchoolTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileHeader;
