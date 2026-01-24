import React, {useEffect, useState}from "react";
import { List, Button, Layout, Select, Flex, Form, Modal, Typography } from 'antd';
import ChromeHeader from "../../components/ChromeHeader";
import './Profile.css';
import TextArea from "antd/es/input/TextArea";
import { backendUrl, platformOptions, userPid } from "../../utils/Const";
import {getItem} from "../../utils/Chrome/getItem";   
import {setItem} from "../../utils/Chrome/setItem";
import { useLocation } from "react-router-dom";

const { Content } = Layout;

const ProfileCard = (
    {item,
    delFunc, 
    saveFunc,
    toggleEdit,
    edit,
    isModalOpen,
    setIsModalOpen,
    id}
) =>{
    const [formData, setFormData] = useState(item);
    useEffect(() => {
        setFormData(item);
      }, [item]);
    const showModal = () => {
        setIsModalOpen();
    };
    const handleCancel = () => {
        setIsModalOpen();
    };

    const onSave = () =>{
        saveFunc(formData);
    }

    // 编辑内容的展示
    const handleChange = (e) => { 
        const { name, value } = e.target;
        setFormData(prevState => ({
          ...prevState,
          [name]: value,
        }));
    }; 
    const handleActiveChange = (e) => {
        setFormData(prevState => ({
          ...prevState,
            isactive: e,
        }));
    }
    const handlePlatformChange = (e) => {
        setFormData(prevState => ({
          ...prevState,
            platform: e,
        }));
    }

    return (
        <Form>

            <div class="list-item">
                <div class="item-title">
                    <TextArea placeholder="Input rule..." onChange={handleChange} name="rule" disabled={!edit} value={formData.rule}/>
                </div>
                <div class="item-controls" contentEditable={edit}>
                { edit ? <Button key="save" type="primary" contentEditable="false" onClick={onSave} htmlType="submit">保存</Button> : <Button key="edit" type="primary" contentEditable="false" onClick={toggleEdit}>编辑</Button> }
                <Button key="del" type="primary" danger contentEditable="false" onClick={showModal}>删除</Button>
                <Modal 
                    title="此操作不可逆!" 
                    open={isModalOpen} 
                    onOk={delFunc} 
                    onCancel={handleCancel}
                    footer={[
                        <Button key="back" onClick={handleCancel}>
                            取消
                        </Button>,
                        <Button key="submit" type="primary" onClick={delFunc}>
                            确定
                        </Button>,
                    ]}>
                    确定删除<Typography.Text keyboard>{formData.rule}</Typography.Text>
                </Modal>
                <Select
                    name="platform"
                    value={formData.platform}
                    options={platformOptions}
                    disabled={!edit}
                    onChange={handlePlatformChange}
                    />
                <Select
                    name="isactive"
                    value={formData.isactive}
                    options={[{
                        value: true,
                        label: '激活'
                    },{
                        value: false,
                        label: '非激活'
                    }]}
                    disabled={!edit}
                    onChange={handleActiveChange}
                    />
                
                </div>
            </div> 
        </Form>
    );
}

const Profile = (
) => {
    const [nowData, setNowData] = useState([]);
    const [editable, setEditable] = useState([]);
    const location = useLocation();
    // 删除的时候加载一个对话框
    const [isModalOpen, setIsModalOpen] = useState([]);

    async function getData(){
        const data = await getItem("profiles",[]);
        setNowData(data);
        setEditable(new Array(data.length).fill(false));
        setIsModalOpen(new Array(data.length).fill(false));
    }
    useEffect(() => {
        getData();
    }, [location]);
    // 点击保存之后， 先更新sever数据库，更新chrome数据库
    async function updateCard(id, item, index) {
        //需要check一下是不是以"我不想看"开头
        if(item.rule.indexOf("我不想看")!==0){
            alert("不行,重写! 规则必须以\"我不想看\"开头");
            return;
        }
        const newData = nowData.map(card => card.iid === id ? item : card);
        fetch(`${backendUrl}/save_rules`,{
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify({pid:userPid, isbot:false, isdel:false, rule:item, iid:id}),
        });
        let ret = await setItem('profiles', newData);
        console.log("update (chrome): "+ret);

        setNowData(newData);
        toggleEdit(index);
    }
    //点击删除， 先更新sever数据库，在更新chrome数据库， 最后更新前端存的状态
    async function deleteCard(id, dis_index){
        const newData = nowData.filter(item => item.iid !== id);
        fetch(`${backendUrl}/save_rules`,{
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify({isbot:false, isdel:true, rule:{}, iid:id, pid:userPid}),
        });
        let ret = await setItem('profiles', newData);
        console.log("delete (chrome): "+ret);
        setNowData(newData);
        setIsModalOpen(isModalOpen=>isModalOpen.filter((item, index) => index !== dis_index));
        setEditable(editable=>editable.filter((item, index) => index !== dis_index));
    }

    function changeModalOpen(index){
        setIsModalOpen(isModalOpen=>isModalOpen.map((item, i) => i === index ? !item : item));
    }

    //添加卡片，这里只是在前端添加，不保存默认的规则
    const addCard = ()=>{
        // editable 全部是false才行
        if(editable.some(item=>item)){
            alert("请先保存或取消编辑中的卡片");
            return;
        }
        const max_iid = nowData.length===0?0:nowData.reduce((max, item) => item.iid > max ? item.iid : max, 0);
        const newData={
            iid: max_iid+1,
            platform: 0,
            rule: '我不想看……',
            isactive:true,
        }
        setNowData(nowData=>[...nowData, newData])
        setEditable(editable=>[...editable, true])
        setIsModalOpen(isModalOpen=>[...isModalOpen, false])
    }
    const toggleEdit = (id) => {
        const newEditable = editable.map((item, index) => index === id ? !item : item);
        setEditable(newEditable);
    }

    return (
        <Layout className="layoutStyle">
            <ChromeHeader title="已定义的规则"/>
            <Content className="contentStyle">
                <List
                    grid={{gutter: 16, xs: 1,sm: 1, md: 1,lg: 1, xl: 1, xxl: 1}}
                    dataSource={nowData}
                    renderItem={(item, index) => (
                        <ProfileCard  key={index} item={item} delFunc={() => deleteCard(item.iid, index)} saveFunc={(data) => updateCard(item.iid, data, index)} toggleEdit={()=>toggleEdit(index)} edit={editable[index]} isModalOpen={isModalOpen[index]} setIsModalOpen={()=>changeModalOpen(index)} id={index} />
                    )}
                />
                <Flex vertical gap="small" style={{width: '100%',}}>
                    <Button type="dashed" size='large' onClick={addCard}>新增</Button> 
                </Flex>
            </Content>
        </Layout>
    );
}

export default Profile;